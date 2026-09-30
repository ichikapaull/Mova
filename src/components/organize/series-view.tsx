"use client";

import {
  ImageIcon,
  ListOrderedIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  TvIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MediaPickerDialog } from "@/components/media/media-picker";
import { FallbackPoster, MediaThumbnail } from "@/components/media/media-thumbnail";
import { NameDescriptionDialog } from "@/components/organize/name-dialog";
import { SortableList } from "@/components/organize/sortable-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { invalidateLibraryCache } from "@/lib/client/library-cache";
import { thumbnailUrl, watchHref } from "@/lib/client/media-urls";
import { callAction } from "@/lib/client/run-action";
import { formatDuration, formatEpisodeLabel, pluralize } from "@/lib/format";
import { addToSeriesAction, removeFromSeriesAction, updateEpisodeAction } from "@/server/actions/media";
import {
  autoNumberEpisodesAction,
  createSeriesAction,
  deleteSeriesAction,
  reorderEpisodesAction,
  sortEpisodesByNumberAction,
  updateSeriesAction,
} from "@/server/actions/organize";
import type { SeriesEpisode } from "@/server/repositories/series";

type Series = {
  id: number;
  title: string;
  description: string | null;
  posterMediaId: number | null;
  episodes: SeriesEpisode[];
};

function NumberCell({
  value,
  label,
  onCommit,
}: {
  value: number | null;
  label: string;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  return (
    <input
      aria-label={label}
      value={text}
      inputMode="decimal"
      placeholder="–"
      onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
      onBlur={() => {
        const next = text.trim() === "" ? null : Number(text);
        if (next !== value && (next === null || Number.isFinite(next))) onCommit(next);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="h-7 w-10 rounded border border-transparent bg-transparent text-center text-xs tabular-nums outline-none hover:border-border focus:border-border-strong focus:bg-white/[0.04]"
    />
  );
}

export function SeriesView({ series, resumeId }: { series: Series; resumeId: number | null }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | "add" | null>(null);
  const refresh = () => {
    invalidateLibraryCache();
    router.refresh();
  };
  const watched = series.episodes.filter((e) => e.completed).length;
  const resume = series.episodes.find((e) => e.id === resumeId);
  const resumeLabel = resume ? formatEpisodeLabel(resume.seasonNumber, resume.episodeNumber) : null;
  const seasons = new Set(series.episodes.map((e) => e.seasonNumber ?? -1));
  const poster = series.episodes.find((e) => e.id === series.posterMediaId);

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="absolute inset-y-0 right-0 w-full md:w-[60%]">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element -- local API image
            <img src={thumbnailUrl(poster)} alt="" className="size-full object-cover" />
          ) : (
            <FallbackPoster id={series.id * 7} title="" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/85 to-transparent md:via-surface/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
        </div>
        <div className="relative flex min-h-[260px] flex-col justify-end gap-3 p-7 md:max-w-[60%] lg:p-9">
          <Link href="/series" className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground">
            <TvIcon className="size-3.5" /> Series
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-balance lg:text-4xl">{series.title}</h1>
          <p className="text-sm text-muted-foreground">
            {pluralize(series.episodes.length, "episode")}
            {seasons.size > 1 && ` · ${pluralize(seasons.size, "season")}`}
            {watched > 0 && ` · ${watched} watched`}
          </p>
          {series.description && <p className="line-clamp-3 max-w-xl text-sm text-foreground/80">{series.description}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {resume && (
              <Button asChild size="lg">
                <Link href={watchHref(resume.id)}>
                  <PlayIcon className="fill-current" />
                  {watched === 0 && !resume.progressSec ? "Play" : "Continue"}
                  {resumeLabel && <span className="text-primary-foreground/60">{resumeLabel}</span>}
                </Link>
              </Button>
            )}
            <Button size="lg" variant="glass" onClick={() => setDialog("add")}>
              <PlusIcon /> Add episodes
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="glass" className="size-11" aria-label="Series options">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setDialog("edit")}>
                  <PencilIcon /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void callAction(sortEpisodesByNumberAction(series.id), { success: "Sorted by episode number" }).then(refresh)}>
                  <ListOrderedIcon /> Sort by episode number
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void callAction(autoNumberEpisodesAction(series.id), { success: "Episode numbers detected from filenames" }).then(refresh)}
                >
                  <WandSparklesIcon /> Detect numbers from filenames
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                  <Trash2Icon /> Delete series
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      {series.episodes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="font-medium">No episodes yet</p>
          <p className="text-sm text-muted-foreground">Add episodes here, or select videos in the library and choose “Series”.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-2 text-[11px] font-medium tracking-wider text-subtle-foreground uppercase">
            <span className="w-7" />
            <span className="w-10 text-center">Season</span>
            <span className="w-10 text-center">Ep.</span>
            <span className="ml-2">Episode</span>
          </div>
          <SortableList
            items={series.episodes}
            groupOf={(e) => e.seasonNumber ?? -1}
            renderGroupHeader={(e) =>
              seasons.size > 1 ? (
                <h3 className="mt-5 mb-2 px-2 text-sm font-semibold text-muted-foreground first:mt-0">
                  {e.seasonNumber == null ? "Specials" : `Season ${e.seasonNumber}`}
                </h3>
              ) : null
            }
            onReorder={(ids) => void callAction(reorderEpisodesAction(series.id, ids)).then(refresh)}
            renderItem={(episode) => {
              const progress = episode.completed ? 1 : episode.progressSec && episode.durationSec ? episode.progressSec / episode.durationSec : 0;
              return (
                <div className="flex items-center gap-2">
                  <NumberCell
                    key={`s${episode.id}-${episode.seasonNumber}`}
                    label="Season"
                    value={episode.seasonNumber}
                    onCommit={(value) =>
                      void callAction(updateEpisodeAction(episode.id, { seasonNumber: value == null ? null : Math.floor(value), episodeNumber: episode.episodeNumber })).then(refresh)
                    }
                  />
                  <NumberCell
                    key={`e${episode.id}-${episode.episodeNumber}`}
                    label="Episode"
                    value={episode.episodeNumber}
                    onCommit={(value) =>
                      void callAction(updateEpisodeAction(episode.id, { seasonNumber: episode.seasonNumber, episodeNumber: value })).then(refresh)
                    }
                  />
                  <Link href={watchHref(episode.id)} className="group/thumb relative ml-2 aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-surface sm:w-36">
                    <MediaThumbnail item={episode} />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/thumb:opacity-100">
                      <PlayIcon className="size-5 fill-white text-white" />
                    </span>
                    {progress > 0 && (
                      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
                        <span className="block h-full bg-brand" style={{ width: `${progress * 100}%` }} />
                      </span>
                    )}
                  </Link>
                  <Link href={`/media/${episode.id}`} className="min-w-0 flex-1 pl-1">
                    <span className="block truncate text-sm font-medium hover:underline">{episode.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[formatDuration(episode.durationSec), episode.completed ? "Watched" : null, episode.status !== "available" ? "Missing" : null]
                        .filter(Boolean)
                        .join(" • ")}
                    </span>
                  </Link>
                  <Tooltip content="Use as series poster">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Use as series poster"
                      onClick={() => void callAction(updateSeriesAction(series.id, { posterMediaId: episode.id }), { success: "Poster updated" }).then(refresh)}
                    >
                      <ImageIcon />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Remove from series">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove from series"
                      onClick={() => void callAction(removeFromSeriesAction([episode.id])).then(refresh)}
                    >
                      <XIcon />
                    </Button>
                  </Tooltip>
                </div>
              );
            }}
          />
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === "edit" && (
          <NameDescriptionDialog
            title="Edit series"
            nameLabel="Title"
            submitLabel="Save"
            initial={{ name: series.title, description: series.description }}
            onSubmit={async (value) => {
              if ((await callAction(updateSeriesAction(series.id, { title: value.name, description: value.description }), { success: "Saved" })) !== undefined) {
                setDialog(null);
                refresh();
              }
            }}
          />
        )}
        {dialog === "add" && (
          <MediaPickerDialog
            title="Add episodes"
            description="Season and episode numbers are detected from filenames; adjust them in the list afterwards."
            multiple
            excludeIds={series.episodes.map((e) => e.id)}
            confirmLabel={(n) => (n ? `Add ${pluralize(n, "episode")}` : "Add")}
            onConfirm={async (ids) => {
              if ((await callAction(addToSeriesAction(ids, series.id), { success: "Episodes added" })) !== undefined) {
                setDialog(null);
                refresh();
              }
            }}
          />
        )}
        {dialog === "delete" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete “{series.title}”?</DialogTitle>
              <DialogDescription>The series grouping is removed. All episodes stay in your library.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if ((await callAction(deleteSeriesAction(series.id), { success: "Series deleted" })) !== undefined) router.push("/series");
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

export function NewSeriesButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon /> New series
      </Button>
      {open && (
        <NameDescriptionDialog
          title="New series"
          nameLabel="Title"
          description="Group episodes so the player can move to the next one automatically."
          submitLabel="Create"
          onSubmit={async (value) => {
            const created = await callAction(createSeriesAction({ title: value.name, description: value.description }));
            if (created) router.push(`/series/${created.id}`);
          }}
        />
      )}
    </Dialog>
  );
}
