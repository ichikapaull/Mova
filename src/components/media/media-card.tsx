"use client";

import { CheckIcon, HeartIcon, MoreHorizontalIcon, PlayIcon, WifiOffIcon } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { useMediaActions } from "@/components/media/media-actions";
import { MediaMenuItems } from "@/components/media/media-menu-items";
import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { PreviewVideo } from "@/components/media/preview-video";
import { useHoverPreview } from "@/components/media/use-hover-preview";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { watchHref } from "@/lib/client/media-urls";
import { formatDuration, formatResolution } from "@/lib/format";
import type { MediaListItem } from "@/lib/library-query";
import { cn } from "@/lib/utils";

export type MediaCardProps = {
  item: MediaListItem;
  /** Where clicking the card goes: the detail page (default) or straight into the player. */
  clickAction?: "details" | "play";
  /** Playback context (e.g. "collection:3") forwarded to the player. */
  list?: string | null;
  selected?: boolean;
  selectionMode?: boolean;
  /** Position in the surrounding grid (for Shift range selection). */
  index?: number;
  onSelectToggle?: (item: MediaListItem, event: React.MouseEvent, index?: number) => void;
  subtitle?: string | null;
  className?: string;
  eager?: boolean;
};

function metaLine(item: MediaListItem, subtitle?: string | null): string {
  if (item.durationSec == null && item.thumbnailStatus === "failed") return "Unreadable file";
  return [subtitle ?? item.episodeLabel, formatDuration(item.durationSec) !== "--:--" ? formatDuration(item.durationSec) : null, formatResolution(item.width, item.height), item.categoryName]
    .filter(Boolean)
    .join(" • ");
}

function MediaCardImpl({
  item,
  clickAction = "details",
  list,
  selected = false,
  selectionMode = false,
  index,
  onSelectToggle,
  subtitle,
  className,
  eager,
}: MediaCardProps) {
  const actions = useMediaActions();
  const preview = useHoverPreview(item);
  const unavailable = item.status !== "available" || !item.sourceOnline;
  const progress =
    !item.completed && item.progressSec && item.durationSec ? Math.min(1, item.progressSec / item.durationSec) : item.completed ? 1 : 0;
  const href =
    clickAction === "play" ? watchHref(item.id, { list }) : `/media/${item.id}${list ? `?list=${encodeURIComponent(list)}` : ""}`;

  const handleClick = (event: React.MouseEvent) => {
    if (!onSelectToggle) return;
    if (selectionMode || event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      onSelectToggle(item, event, index);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn("group/card relative flex min-w-0 flex-col gap-2.5", className)}
          onPointerEnter={(event) => event.pointerType === "mouse" && preview.start()}
          onPointerLeave={preview.stop}
          data-selected={selected || undefined}
        >
          <Link
            href={href}
            onClick={handleClick}
            onFocus={preview.start}
            onBlur={preview.stop}
            draggable={false}
            aria-label={item.title}
            className={cn(
              "relative block aspect-video overflow-hidden rounded-lg bg-surface ring-1 ring-white/[0.06] transition-[transform,box-shadow] duration-200 ease-out will-change-transform",
              "group-hover/card:z-10 group-hover/card:scale-[1.035] group-hover/card:shadow-2xl group-hover/card:shadow-black/70 group-hover/card:ring-white/15",
              "focus-visible:scale-[1.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70",
              selected && "ring-2 ring-foreground",
              unavailable && "opacity-60",
            )}
          >
            <MediaThumbnail item={item} eager={eager} />
            {preview.active && <PreviewVideo id={item.id} version={item.version} />}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent opacity-80" />

            {item.durationSec != null && (
              <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10.5px] font-medium tabular-nums text-white/90 backdrop-blur-sm">
                {formatDuration(item.durationSec)}
              </span>
            )}
            {unavailable && (
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[10.5px] font-medium text-warning">
                <WifiOffIcon className="size-3" /> {item.status === "missing" ? "Missing" : "Offline"}
              </span>
            )}
            {item.completed && !selectionMode && (
              <span className="absolute top-2 left-2 inline-flex size-5 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm group-hover/card:opacity-0">
                <CheckIcon className="size-3" strokeWidth={3} />
              </span>
            )}
            {progress > 0 && (
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
                <div className="h-full bg-brand" style={{ width: `${progress * 100}%` }} />
              </div>
            )}
          </Link>

          {/* Hover controls (outside the link so they don't navigate) */}
          <div className="pointer-events-none absolute inset-x-0 top-0 aspect-video transition-transform duration-200 ease-out group-hover/card:z-20 group-hover/card:scale-[1.035]">
            {onSelectToggle && (
              <button
                type="button"
                aria-label={selected ? "Deselect" : "Select"}
                aria-pressed={selected}
                onClick={(event) => onSelectToggle(item, event, index)}
                className={cn(
                  "pointer-events-auto absolute top-2 left-2 flex size-5 items-center justify-center rounded-full border border-white/50 bg-black/40 text-transparent backdrop-blur-sm transition-opacity duration-150",
                  selectionMode || selected ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100",
                  selected && "border-foreground bg-foreground text-background",
                )}
              >
                <CheckIcon className="size-3" strokeWidth={3} />
              </button>
            )}
            <div
              className={cn(
                "absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 has-[[data-state=open]]:opacity-100",
                selectionMode && "hidden",
              )}
            >
              <button
                type="button"
                aria-label={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
                onClick={() => actions.setFavorite([item.id], !item.isFavorite)}
                className="pointer-events-auto flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition-colors hover:bg-black/80"
              >
                <HeartIcon className={cn("size-3.5", item.isFavorite && "fill-brand text-brand")} />
              </button>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger
                  aria-label="More actions"
                  className="pointer-events-auto flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition-colors outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <MoreHorizontalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
                  <MediaMenuItems item={item} Item={DropdownMenuItem} Separator={DropdownMenuSeparator} list={list} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {!selectionMode && clickAction === "details" && !unavailable && (
              <Link
                href={watchHref(item.id, { list })}
                aria-label={`Play ${item.title}`}
                tabIndex={-1}
                className="pointer-events-auto absolute bottom-2 left-2 flex size-8 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover/card:opacity-100 hover:scale-105"
              >
                <PlayIcon className="size-3.5 translate-x-px fill-current" />
              </Link>
            )}
            {item.isFavorite && (
              <HeartIcon className="absolute top-2.5 right-2.5 size-3.5 fill-brand text-brand drop-shadow transition-opacity group-hover/card:opacity-0" />
            )}
          </div>

          <div className="min-w-0 px-0.5">
            <p className="truncate text-[13.5px] leading-snug font-medium text-foreground/95" title={item.title}>
              {item.title}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{metaLine(item, subtitle) || " "}</p>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <MediaMenuItems item={item} Item={ContextMenuItem} Separator={ContextMenuSeparator} list={list} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const MediaCard = memo(MediaCardImpl);

export function MediaCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="skeleton aspect-video rounded-lg" />
      <div className="space-y-1.5 px-0.5">
        <div className="skeleton h-3.5 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}
