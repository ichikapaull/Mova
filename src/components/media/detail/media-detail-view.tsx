"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  HeartIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
  TvIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CategoryEditor, TagEditor } from "@/components/media/detail/taxonomy-editors";
import { useMediaActions } from "@/components/media/media-actions";
import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { PreviewVideo } from "@/components/media/preview-video";
import { useHoverPreview } from "@/components/media/use-hover-preview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { watchHref } from "@/lib/client/media-urls";
import { callAction } from "@/lib/client/run-action";
import { formatBytes, formatDate, formatDateTime, formatDuration, formatEpisodeLabel, formatResolution, formatRuntime } from "@/lib/format";
import type { MediaListItem } from "@/lib/library-query";
import { cn } from "@/lib/utils";
import { openExternallyAction } from "@/server/actions/media";
import type { MediaDetail } from "@/server/repositories/media";

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground/90">{children ?? "—"}</dd>
    </div>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h2 className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

export function MediaDetailView({
  media,
  listItem,
  list,
  children,
}: {
  media: MediaDetail;
  listItem: MediaListItem;
  list: string | null;
  /** Server-rendered extra sections (related videos). */
  children?: React.ReactNode;
}) {
  const actions = useMediaActions();
  const preview = useHoverPreview(listItem);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const playable = media.status === "available" && media.source.isOnline;
  const history = media.history;
  const resumeAt = history && !history.completed && history.positionSec > 5 ? history.positionSec : null;
  const target = { ids: [media.id], title: media.displayTitle };
  const resolution = formatResolution(media.width, media.height);
  const episodeLabel = media.series ? formatEpisodeLabel(media.series.seasonNumber, media.series.episodeNumber) : null;

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end">
        <div
          className="group relative aspect-video overflow-hidden rounded-xl bg-surface ring-1 ring-border"
          onPointerEnter={preview.start}
          onPointerLeave={preview.stop}
        >
          <MediaThumbnail item={listItem} eager />
          {preview.active && <PreviewVideo id={media.id} version={listItem.version} />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          {playable && (
            <Link
              href={watchHref(media.id, { list })}
              aria-label="Play"
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-white/90 text-black shadow-2xl transition-transform duration-200 group-hover:scale-105">
                <PlayIcon className="size-6 translate-x-0.5 fill-current" />
              </span>
            </Link>
          )}
          {resumeAt && media.durationSec && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
              <div className="h-full bg-brand" style={{ width: `${(resumeAt / media.durationSec) * 100}%` }} />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {media.series && (
            <Link
              href={`/series/${media.series.seriesId}`}
              className="flex w-fit items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
            >
              <TvIcon className="size-3.5" /> {media.series.title}
              {episodeLabel && <span className="text-subtle-foreground">· {episodeLabel}</span>}
            </Link>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-balance break-words lg:text-[32px] lg:leading-tight">{media.displayTitle}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {[formatRuntime(media.durationSec), resolution, media.videoCodec?.toUpperCase(), media.extension.toUpperCase(), formatBytes(media.fileSize)]
              .filter(Boolean)
              .map((part, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-subtle-foreground">·</span>}
                  {part}
                </span>
              ))}
          </p>
          {!playable && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              {media.status === "missing"
                ? "This file is missing from disk. It was moved, renamed or deleted — a rescan will relink it if it was moved."
                : "The media source is offline. Is the external disk mounted?"}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {playable && (
              <Button asChild size="lg">
                <Link href={watchHref(media.id, { list })}>
                  <PlayIcon className="fill-current" />
                  {resumeAt ? `Resume ${formatDuration(resumeAt)}` : "Play"}
                </Link>
              </Button>
            )}
            {playable && resumeAt && (
              <Button asChild size="lg" variant="secondary">
                <Link href={watchHref(media.id, { list, t: 0 })}>
                  <RotateCcwIcon /> Start over
                </Link>
              </Button>
            )}
            <Button
              size="icon"
              variant="secondary"
              className="size-11"
              aria-label={media.isFavorite ? "Remove from favorites" : "Add to favorites"}
              onClick={() => actions.setFavorite([media.id], !media.isFavorite)}
            >
              <HeartIcon className={cn(media.isFavorite && "fill-brand text-brand")} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="secondary" className="size-11" aria-label="More actions">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => actions.openDialog("edit", target)}>
                  <PencilIcon /> Edit Metadata…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.openDialog("collection", target)}>
                  <FolderPlusIcon /> Add to Collection…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.openDialog("series", target)}>
                  <TvIcon /> {media.series ? "Move to Series…" : "Add to Series…"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.setWatched([media.id], !history?.completed)}>
                  {history?.completed ? <CircleIcon /> : <CheckCircle2Icon />}
                  {history?.completed ? "Mark Unwatched" : "Mark Watched"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!playable} onSelect={() => actions.showInFolder(media.id)}>
                  <FolderOpenIcon /> Show in Folder
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!playable} onSelect={() => void callAction(openExternallyAction(media.id))}>
                  <ExternalLinkIcon /> Open in System Player
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => actions.openDialog("remove", target)}>
                  <Trash2Icon /> Remove from Library
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          <Section title="Tags">
            <TagEditor mediaId={media.id} tags={media.tags} />
          </Section>
          <Section title="Categories">
            <CategoryEditor mediaId={media.id} categories={media.categories} />
          </Section>
          {media.collections.length > 0 && (
            <Section title="In collections">
              <div className="flex flex-wrap gap-1.5">
                {media.collections.map((c) => (
                  <Link
                    key={c.id}
                    href={`/collections/${c.id}`}
                    className="inline-flex h-7 items-center rounded-full border border-border-strong bg-white/[0.03] px-3 text-[13px] hover:bg-white/[0.07]"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </Section>
          )}
          <Section title="Notes">
            {media.notes ? (
              <div>
                <p className={cn("text-sm whitespace-pre-wrap text-foreground/85", !notesExpanded && "line-clamp-5")}>{media.notes}</p>
                <div className="mt-1 flex gap-3 text-xs">
                  {media.notes.length > 300 && (
                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setNotesExpanded((v) => !v)}>
                      {notesExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => actions.openDialog("edit", target)}>
                    Edit
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => actions.openDialog("edit", target)}
                className="w-fit text-sm text-muted-foreground hover:text-foreground"
              >
                + Add a note
              </button>
            )}
          </Section>
        </div>

        <Section title="File">
          <dl className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
            <InfoRow label="Filename">
              <span className="font-mono text-xs">{media.filename}</span>
            </InfoRow>
            <InfoRow label="Folder">
              <span className="font-mono text-xs">{media.relativePath.split("/").slice(0, -1).join("/") || "/"}</span>
              <span className="block text-xs text-muted-foreground">in {media.source.name}</span>
            </InfoRow>
            <InfoRow label="Duration">{formatDuration(media.durationSec)}</InfoRow>
            <InfoRow label="Resolution">{media.width && media.height ? `${media.width} × ${media.height}${resolution ? ` (${resolution})` : ""}` : null}</InfoRow>
            <InfoRow label="Video">{[media.videoCodec, media.fps ? `${Math.round(media.fps * 100) / 100} fps` : null].filter(Boolean).join(" · ") || null}</InfoRow>
            <InfoRow label="Audio">{media.audioCodec}</InfoRow>
            <InfoRow label="Bitrate">{media.bitrate ? `${(media.bitrate / 1_000_000).toFixed(1)} Mb/s` : null}</InfoRow>
            <InfoRow label="Size">{formatBytes(media.fileSize)}</InfoRow>
            <InfoRow label="Added">{formatDate(media.createdAt)}</InfoRow>
            <InfoRow label="Modified">{formatDate(media.fileModifiedAt)}</InfoRow>
            {history && (
              <InfoRow label="Watched">
                {history.completed ? "Completed" : resumeAt ? `Stopped at ${formatDuration(resumeAt)}` : "Started"}
                <span className="block text-xs text-muted-foreground">
                  {history.playCount}× · last {formatDateTime(history.lastWatchedAt)}
                </span>
              </InfoRow>
            )}
            {(media.probeError || media.thumbnailError) && (
              <InfoRow label="Issues">
                <span className="text-xs text-warning">{media.probeError ?? media.thumbnailError}</span>
              </InfoRow>
            )}
          </dl>
        </Section>
      </div>

      {children}
    </div>
  );
}
