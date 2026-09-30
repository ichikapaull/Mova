"use client";

import { FolderPlusIcon, ListVideoIcon, PlusIcon, TvIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { TagInput } from "@/components/media/tag-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseEpisodeFromFilename } from "@/lib/episode-parser";
import { invalidateLibraryCache } from "@/lib/client/library-cache";
import { callAction } from "@/lib/client/run-action";
import { useTaxonomy } from "@/lib/client/taxonomy";
import { pluralize } from "@/lib/format";
import {
  addCategoryAction,
  addTagsAction,
  addToCollectionAction,
  addToSeriesAction,
  removeFromLibraryAction,
  setFavoriteAction,
  setWatchedAction,
  showInFolderAction,
  updateMediaMetadataAction,
} from "@/server/actions/media";

type Target = { ids: number[]; title?: string };
type DialogState =
  | { kind: "tag"; target: Target }
  | { kind: "category"; target: Target }
  | { kind: "collection"; target: Target }
  | { kind: "series"; target: Target }
  | { kind: "edit"; target: Target }
  | { kind: "remove"; target: Target }
  | null;

type MediaActionsApi = {
  openDialog: (kind: NonNullable<DialogState>["kind"], target: Target) => void;
  setFavorite: (ids: number[], favorite: boolean) => Promise<void>;
  setWatched: (ids: number[], watched: boolean) => Promise<void>;
  showInFolder: (id: number) => Promise<void>;
  /** Refresh server components and client caches after a change. */
  refresh: () => void;
};

const MediaActionsContext = createContext<MediaActionsApi | null>(null);

export function useMediaActions(): MediaActionsApi {
  const api = useContext(MediaActionsContext);
  if (!api) throw new Error("useMediaActions must be used inside MediaActionsProvider");
  return api;
}

export function MediaActionsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  const refresh = useCallback(() => {
    invalidateLibraryCache();
    router.refresh();
  }, [router]);

  const api = useMemo<MediaActionsApi>(
    () => ({
      openDialog: (kind, target) => setDialog({ kind, target }),
      setFavorite: async (ids, favorite) => {
        const ok = await callAction(setFavoriteAction(ids, favorite), {
          success: ids.length > 1 ? (favorite ? "Added to favorites" : "Removed from favorites") : undefined,
        });
        if (ok !== undefined) refresh();
      },
      setWatched: async (ids, watched) => {
        const ok = await callAction(setWatchedAction(ids, watched), {
          success: watched ? `Marked ${pluralize(ids.length, "video")} as watched` : "Marked as unwatched",
        });
        if (ok !== undefined) refresh();
      },
      showInFolder: async (id) => {
        await callAction(showInFolderAction(id), { error: "Could not show in folder" });
      },
      refresh,
    }),
    [refresh],
  );

  const close = () => setDialog(null);
  const done = () => {
    close();
    refresh();
  };

  return (
    <MediaActionsContext.Provider value={api}>
      {children}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
        {dialog?.kind === "tag" && <TagDialog target={dialog.target} onDone={done} />}
        {dialog?.kind === "category" && <CategoryDialog target={dialog.target} onDone={done} />}
        {dialog?.kind === "collection" && <CollectionDialog target={dialog.target} onDone={done} />}
        {dialog?.kind === "series" && <SeriesDialog target={dialog.target} onDone={done} />}
        {dialog?.kind === "edit" && <EditMetadataDialog target={dialog.target} onDone={done} />}
        {dialog?.kind === "remove" && <RemoveDialog target={dialog.target} onDone={done} onCancel={close} />}
      </Dialog>
    </MediaActionsContext.Provider>
  );
}

function targetLabel(target: Target): string {
  return target.ids.length === 1 && target.title ? `“${target.title}”` : pluralize(target.ids.length, "video");
}

function TagDialog({ target, onDone }: { target: Target; onDone: () => void }) {
  const { data } = useTaxonomy(true);
  const [pending, setPending] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async (names: string[]) => {
    if (names.length === 0) return;
    setSaving(true);
    const result = await callAction(addTagsAction(target.ids, names), {
      success: `Tagged ${targetLabel(target)}`,
    });
    setSaving(false);
    if (result) onDone();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add tags</DialogTitle>
        <DialogDescription>Tag {targetLabel(target)}. Pick existing tags or type to create new ones.</DialogDescription>
      </DialogHeader>
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pending.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setPending((p) => p.filter((n) => n !== name))}
              className="rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-destructive/20 hover:text-destructive"
              title="Remove"
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <TagInput
        autoFocus
        suggestions={data?.tags ?? []}
        exclude={pending}
        onPick={(name) => setPending((p) => (p.some((n) => n.toLowerCase() === name.toLowerCase()) ? p : [...p, name]))}
      />
      <DialogFooter>
        <Button disabled={saving || pending.length === 0} onClick={() => submit(pending)}>
          Add {pending.length > 0 ? pluralize(pending.length, "tag") : "tags"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PickerList<T extends { id: number }>({
  items,
  render,
  onPick,
  empty,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
  empty: string;
}) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="-mx-1 max-h-72 overflow-y-auto">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item)}
          className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/[0.06]"
        >
          {render(item)}
        </button>
      ))}
    </div>
  );
}

function CreateInline({ placeholder, onCreate, busy }: { placeholder: string; onCreate: (name: string) => void; busy: boolean }) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onCreate(name.trim());
      }}
    >
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={placeholder} maxLength={100} />
      <Button type="submit" variant="secondary" disabled={busy || !name.trim()}>
        <PlusIcon /> Create
      </Button>
    </form>
  );
}

function CategoryDialog({ target, onDone }: { target: Target; onDone: () => void }) {
  const { data } = useTaxonomy(true);
  const [busy, setBusy] = useState(false);
  const add = async (category: number | { name: string }, label: string) => {
    setBusy(true);
    const result = await callAction(addCategoryAction(target.ids, category), { success: `Added to ${label}` });
    setBusy(false);
    if (result !== undefined) onDone();
  };
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add to category</DialogTitle>
        <DialogDescription>Choose a category for {targetLabel(target)}.</DialogDescription>
      </DialogHeader>
      <PickerList
        items={data?.categories ?? []}
        empty={data ? "No categories yet." : "Loading…"}
        onPick={(category) => add(category.id, category.name)}
        render={(category) => (
          <>
            <CategoryIcon name={category.icon} className="size-4 text-muted-foreground" />
            <span className="flex-1 truncate">{category.name}</span>
            <span className="text-xs text-subtle-foreground">{category.count}</span>
          </>
        )}
      />
      <CreateInline placeholder="New category name" busy={busy} onCreate={(name) => add({ name }, name)} />
    </DialogContent>
  );
}

function CollectionDialog({ target, onDone }: { target: Target; onDone: () => void }) {
  const { data } = useTaxonomy(true);
  const [busy, setBusy] = useState(false);
  const add = async (collection: number | { name: string }, label: string) => {
    setBusy(true);
    const result = await callAction(addToCollectionAction(target.ids, collection), { success: `Added to ${label}` });
    setBusy(false);
    if (result !== undefined) onDone();
  };
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add to collection</DialogTitle>
        <DialogDescription>Videos are appended to the end of the collection.</DialogDescription>
      </DialogHeader>
      <PickerList
        items={data?.collections ?? []}
        empty={data ? "No collections yet — create one below." : "Loading…"}
        onPick={(collection) => add(collection.id, collection.name)}
        render={(collection) => (
          <>
            <FolderPlusIcon className="size-4 text-muted-foreground" />
            <span className="flex-1 truncate">{collection.name}</span>
            <span className="text-xs text-subtle-foreground">{collection.count}</span>
          </>
        )}
      />
      <CreateInline placeholder="New collection (e.g. Watch Later)" busy={busy} onCreate={(name) => add({ name }, name)} />
    </DialogContent>
  );
}

function SeriesDialog({ target, onDone }: { target: Target; onDone: () => void }) {
  const { data } = useTaxonomy(true);
  const single = target.ids.length === 1;
  const guess = single && target.title ? parseEpisodeFromFilename(target.title) : { seasonNumber: null, episodeNumber: null };
  const [season, setSeason] = useState(guess.seasonNumber?.toString() ?? "");
  const [episode, setEpisode] = useState(guess.episodeNumber?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  const add = async (series: number | { title: string }, label: string) => {
    setBusy(true);
    const numbering = single
      ? { seasonNumber: season.trim() ? Number(season) : null, episodeNumber: episode.trim() ? Number(episode) : null }
      : undefined;
    const result = await callAction(addToSeriesAction(target.ids, series, numbering), { success: `Added to ${label}` });
    setBusy(false);
    if (result !== undefined) onDone();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add to series</DialogTitle>
        <DialogDescription>
          {single ? "Set the episode number, then pick a series." : "Episode numbers are detected from filenames. You can reorder later."}
        </DialogDescription>
      </DialogHeader>
      {single && (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="season">Season</Label>
            <Input id="season" inputMode="numeric" value={season} onChange={(e) => setSeason(e.target.value.replace(/[^\d]/g, ""))} placeholder="—" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="episode">Episode</Label>
            <Input id="episode" inputMode="decimal" value={episode} onChange={(e) => setEpisode(e.target.value.replace(/[^\d.]/g, ""))} placeholder="—" />
          </div>
        </div>
      )}
      <PickerList
        items={data?.series ?? []}
        empty={data ? "No series yet — create one below." : "Loading…"}
        onPick={(series) => add(series.id, series.title)}
        render={(series) => (
          <>
            <TvIcon className="size-4 text-muted-foreground" />
            <span className="flex-1 truncate">{series.title}</span>
            <span className="text-xs text-subtle-foreground">{pluralize(series.episodeCount, "episode")}</span>
          </>
        )}
      />
      <CreateInline placeholder="New series title" busy={busy} onCreate={(title) => add({ title }, title)} />
    </DialogContent>
  );
}

function EditMetadataDialog({ target, onDone }: { target: Target; onDone: () => void }) {
  const id = target.ids[0]!;
  const [title, setTitle] = useState(target.title ?? "");
  const [notes, setNotes] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Notes aren't part of list items; load them when the dialog opens.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/media/${id}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ notes: string | null; displayTitle: string }>) : null))
      .then((detail) => {
        setNotes(detail?.notes ?? "");
        if (detail) setTitle((current) => current || detail.displayTitle);
      })
      .catch(() => setNotes((current) => current ?? ""));
    return () => controller.abort();
  }, [id]);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit details</DialogTitle>
        <DialogDescription>Changes are stored in the library only. The file on disk is not renamed.</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          const result = await callAction(updateMediaMetadataAction(id, { displayTitle: title, notes }), { success: "Saved" });
          setSaving(false);
          if (result !== undefined) onDone();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={5000} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={saving || !title.trim()}>
            Save
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RemoveDialog({ target, onDone, onCancel }: { target: Target; onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Remove from library?</DialogTitle>
        <DialogDescription>
          {targetLabel(target)} will be hidden from Mova, and its tags, collections and series links are dropped. The video file
          on disk is <strong className="text-foreground">not deleted</strong>. You can restore removed videos in Settings → Library.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await callAction(removeFromLibraryAction(target.ids), { success: "Removed from library" });
            setBusy(false);
            if (result !== undefined) onDone();
          }}
        >
          <ListVideoIcon /> Remove from library
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
