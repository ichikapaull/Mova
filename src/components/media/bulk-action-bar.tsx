"use client";

import { formatCount } from "@/lib/format";
import { CheckCircle2Icon, FolderPlusIcon, HeartIcon, ShapesIcon, TagIcon, Trash2Icon, TvIcon, XIcon } from "lucide-react";
import { useMediaActions } from "@/components/media/media-actions";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";

/** Floating bar shown while videos are multi-selected. */
export function BulkActionBar({ ids, onClear }: { ids: number[]; onClear: () => void }) {
  const actions = useMediaActions();
  const target = { ids };
  const run = (fn: () => unknown) => () => {
    void fn();
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="pointer-events-auto flex animate-scale-in items-center gap-1 rounded-xl border border-border-strong bg-[#161616]/95 p-1.5 shadow-2xl shadow-black/70 backdrop-blur-xl"
      >
        <span className="px-3 text-sm font-medium tabular-nums">{formatCount(ids.length)} selected</span>
        <div className="mx-1 h-5 w-px bg-border-strong" />
        <Button variant="ghost" size="sm" onClick={run(() => actions.setFavorite(ids, true))}>
          <HeartIcon /> <span className="hidden md:inline">Favorite</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => actions.openDialog("tag", target)}>
          <TagIcon /> <span className="hidden md:inline">Tag</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => actions.openDialog("category", target)}>
          <ShapesIcon /> <span className="hidden md:inline">Category</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => actions.openDialog("collection", target)}>
          <FolderPlusIcon /> <span className="hidden md:inline">Collection</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => actions.openDialog("series", target)}>
          <TvIcon /> <span className="hidden lg:inline">Series</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={run(() => actions.setWatched(ids, true))}>
          <CheckCircle2Icon /> <span className="hidden lg:inline">Watched</span>
        </Button>
        <Tooltip content="Remove from library (files stay on disk)">
          <Button variant="ghost" size="icon-sm" className="hover:text-destructive" onClick={() => actions.openDialog("remove", target)}>
            <Trash2Icon />
          </Button>
        </Tooltip>
        <div className="mx-1 h-5 w-px bg-border-strong" />
        <Tooltip content="Clear selection" shortcut="Esc">
          <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
            <XIcon />
          </Button>
        </Tooltip>
        <span className="hidden items-center gap-1 pr-2 pl-1 text-[11px] text-subtle-foreground xl:flex">
          <Kbd>Shift</Kbd> range · <Kbd>Ctrl</Kbd>+<Kbd>A</Kbd> all
        </span>
      </div>
    </div>
  );
}
