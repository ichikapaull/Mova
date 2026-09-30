"use client";

import { FolderHeartIcon, MoreHorizontalIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MediaPickerDialog } from "@/components/media/media-picker";
import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { NameDescriptionDialog } from "@/components/organize/name-dialog";
import { SortableList } from "@/components/organize/sortable-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { invalidateLibraryCache } from "@/lib/client/library-cache";
import { watchHref } from "@/lib/client/media-urls";
import { callAction } from "@/lib/client/run-action";
import { formatDuration, formatResolution, pluralize } from "@/lib/format";
import type { MediaListItem } from "@/lib/library-query";
import { addToCollectionAction } from "@/server/actions/media";
import {
  createCollectionAction,
  deleteCollectionAction,
  removeFromCollectionAction,
  reorderCollectionAction,
  updateCollectionAction,
} from "@/server/actions/organize";

type Collection = { id: number; name: string; description: string | null; items: MediaListItem[] };

export function CollectionView({ collection }: { collection: Collection }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | "add" | null>(null);
  const list = `collection:${collection.id}`;
  const firstPlayable = collection.items.find((item) => item.status === "available");
  const totalDuration = collection.items.reduce((sum, item) => sum + (item.durationSec ?? 0), 0);

  const refresh = () => {
    invalidateLibraryCache();
    router.refresh();
  };

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/collections" className="hover:text-foreground">Collections</Link>}
        title={collection.name}
        description={
          <>
            {collection.description && <span className="mb-1 block">{collection.description}</span>}
            {pluralize(collection.items.length, "video")}
            {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
          </>
        }
        actions={
          <>
            {firstPlayable && (
              <Button asChild>
                <Link href={watchHref(firstPlayable.id, { list })}>
                  <PlayIcon className="fill-current" /> Play all
                </Link>
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDialog("add")}>
              <PlusIcon /> Add videos
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="Collection options">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog("edit")}>
                  <PencilIcon /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                  <Trash2Icon /> Delete collection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {collection.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <FolderHeartIcon className="size-9 text-subtle-foreground" strokeWidth={1.5} />
          <p className="font-medium">This collection is empty</p>
          <p className="text-sm text-muted-foreground">Add videos here, or use “Add to Collection” from any video’s menu.</p>
        </div>
      ) : (
        <SortableList
          items={collection.items}
          onReorder={(ids) => void callAction(reorderCollectionAction(collection.id, ids)).then(refresh)}
          renderItem={(item, index) => (
            <div className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-right text-xs text-subtle-foreground tabular-nums">{index + 1}</span>
              <Link
                href={watchHref(item.id, { list })}
                className="group/thumb relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-surface sm:w-36"
              >
                <MediaThumbnail item={item} />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/thumb:opacity-100">
                  <PlayIcon className="size-5 fill-white text-white" />
                </span>
              </Link>
              <Link href={`/media/${item.id}?list=${encodeURIComponent(list)}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium hover:underline">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[formatDuration(item.durationSec), formatResolution(item.width, item.height), item.status !== "available" ? "Missing" : null]
                    .filter(Boolean)
                    .join(" • ")}
                </span>
              </Link>
              <Tooltip content="Remove from collection">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove from collection"
                  onClick={() => void callAction(removeFromCollectionAction(collection.id, [item.id])).then(refresh)}
                >
                  <XIcon />
                </Button>
              </Tooltip>
            </div>
          )}
        />
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === "edit" && (
          <NameDescriptionDialog
            title="Edit collection"
            submitLabel="Save"
            initial={{ name: collection.name, description: collection.description }}
            onSubmit={async (value) => {
              if ((await callAction(updateCollectionAction(collection.id, value), { success: "Saved" })) !== undefined) {
                setDialog(null);
                refresh();
              }
            }}
          />
        )}
        {dialog === "add" && (
          <MediaPickerDialog
            title="Add videos"
            multiple
            excludeIds={collection.items.map((i) => i.id)}
            confirmLabel={(n) => (n ? `Add ${pluralize(n, "video")}` : "Add")}
            onConfirm={async (ids) => {
              if ((await callAction(addToCollectionAction(ids, collection.id), { success: "Added" })) !== undefined) {
                setDialog(null);
                refresh();
              }
            }}
          />
        )}
        {dialog === "delete" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete “{collection.name}”?</DialogTitle>
              <DialogDescription>Only the collection is deleted. The videos stay in your library.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if ((await callAction(deleteCollectionAction(collection.id), { success: "Collection deleted" })) !== undefined) {
                    router.push("/collections");
                  }
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

export function NewCollectionButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon /> New collection
      </Button>
      {open && (
        <NameDescriptionDialog
          title="New collection"
          description="A hand-picked, ordered list — e.g. Best Anime Fights or Watch Later."
          submitLabel="Create"
          onSubmit={async (value) => {
            const created = await callAction(createCollectionAction(value));
            if (created) router.push(`/collections/${created.id}`);
          }}
        />
      )}
    </Dialog>
  );
}
