"use client";

import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { invalidateLibraryCache } from "@/lib/client/library-cache";
import { cn } from "@/lib/utils";
import type { ActivityResponse } from "@/lib/activity";

function describe(activity: ActivityResponse): string | null {
  const { scan, jobs } = activity;
  if (scan.running) {
    if (scan.phase === "probing") return `Reading metadata · ${scan.processed}/${scan.total}`;
    if (scan.phase === "walking") return `Scanning ${scan.sourceName ?? ""}${scan.found ? ` · ${scan.found} found` : ""}`;
    return `Indexing ${scan.sourceName ?? ""}`;
  }
  const thumbs = jobs.thumbnails.queued + jobs.thumbnails.running;
  if (thumbs > 0) return `Generating thumbnails · ${thumbs} left`;
  const previews = jobs.previews.queued + jobs.previews.running;
  if (previews > 0) return `Generating previews · ${previews} left`;
  return null;
}

/**
 * Polls background activity (scans, thumbnail/preview jobs). While work is running
 * it refreshes the current page periodically so new videos and thumbnails appear.
 */
export function ActivityIndicator({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const last = useRef<{ completed: number; finishedAt: number | null; refreshedAt: number }>({ completed: 0, finishedAt: null, refreshedAt: 0 });

  useEffect(() => {
    let timer = 0;
    let cancelled = false;
    const poll = async () => {
      let busy = false;
      try {
        const response = await fetch("/api/activity", { cache: "no-store" });
        if (response.ok) {
          const next = (await response.json()) as ActivityResponse;
          if (cancelled) return;
          setActivity(next);
          busy = next.scan.running || describe(next) !== null;
          const prev = last.current;
          const scanFinished = next.scan.lastFinishedAt !== prev.finishedAt && prev.finishedAt !== undefined;
          const jobsProgressed = next.jobs.completedCount !== prev.completed;
          const now = Date.now();
          // Refresh at most every 4s while jobs run, and right after a scan completes.
          if ((scanFinished && prev.refreshedAt !== 0) || (jobsProgressed && now - prev.refreshedAt > 4000 && prev.refreshedAt !== 0)) {
            invalidateLibraryCache();
            router.refresh();
            prev.refreshedAt = now;
          }
          if (prev.refreshedAt === 0) prev.refreshedAt = now;
          prev.completed = next.jobs.completedCount;
          prev.finishedAt = next.scan.lastFinishedAt;
        }
      } catch {
        // Server restarting; try again later.
      }
      if (!cancelled) timer = window.setTimeout(poll, busy ? 1500 : 6000);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [router]);

  if (!activity) return null;
  const label = describe(activity);

  if (!activity.ffmpegAvailable) {
    const content = (
      <Link
        href="/settings#system"
        className={cn(
          "flex h-9 items-center gap-3 rounded-md px-2.5 text-[12.5px] text-warning transition-colors hover:bg-warning/10",
          collapsed && "justify-center px-0",
        )}
      >
        <AlertTriangleIcon className="size-[18px] shrink-0" />
        {!collapsed && <span className="truncate">FFmpeg not found</span>}
      </Link>
    );
    return collapsed ? <Tooltip content="FFmpeg is required for thumbnails and previews" side="right">{content}</Tooltip> : content;
  }

  if (!label) return null;
  const content = (
    <div
      role="status"
      className={cn("flex h-9 items-center gap-3 rounded-md px-2.5 text-[12px] text-muted-foreground", collapsed && "justify-center px-0")}
    >
      <Loader2Icon className="size-4 shrink-0 animate-spin" />
      {!collapsed && <span className="truncate">{label}</span>}
    </div>
  );
  return collapsed ? <Tooltip content={label} side="right">{content}</Tooltip> : content;
}
