"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useClientSettings } from "@/components/settings-context";
import type { MediaListItem } from "@/lib/library-query";

/** Only one card plays a preview at a time; starting one stops the previous. */
let stopActivePreview: (() => void) | null = null;

type PreviewStatusResponse = { status: "ready" | "pending" | "failed" | "unavailable" };

/**
 * Hover → wait (setting) → play a cached low-res preview. If the preview isn't
 * generated yet, it is requested with priority and polled while still hovered.
 * Leaving the card stops and unloads the video immediately.
 */
export function useHoverPreview(item: Pick<MediaListItem, "id" | "previewStatus" | "status" | "sourceOnline">) {
  const settings = useClientSettings();
  const [active, setActive] = useState(false);
  const timers = useRef<{ delay?: number; poll?: number; aborted: boolean }>({ aborted: false });

  const stop = useCallback(() => {
    window.clearTimeout(timers.current.delay);
    window.clearTimeout(timers.current.poll);
    timers.current.aborted = true;
    setActive(false);
  }, []);

  const enabled =
    settings.hoverPreviewEnabled && settings.previewGeneration !== "off" && item.status === "available" && item.sourceOnline;

  const start = useCallback(() => {
    if (!enabled) return;
    stopActivePreview?.();
    stopActivePreview = stop;
    timers.current.aborted = false;
    window.clearTimeout(timers.current.delay);
    timers.current.delay = window.setTimeout(async () => {
      if (item.previewStatus === "ready") {
        setActive(true);
        return;
      }
      if (item.previewStatus === "failed") return;
      let attempts = 0;
      const check = async () => {
        if (timers.current.aborted) return;
        try {
          const response = await fetch(`/api/media/${item.id}/preview`, { method: "POST" });
          const body = (await response.json()) as PreviewStatusResponse;
          if (timers.current.aborted) return;
          if (body.status === "ready") setActive(true);
          else if (body.status === "pending" && attempts++ < 12) timers.current.poll = window.setTimeout(check, 1200);
        } catch {
          // Preview is optional; stay on the thumbnail.
        }
      };
      void check();
    }, settings.hoverDelayMs);
  }, [enabled, item.id, item.previewStatus, settings.hoverDelayMs, stop]);

  useEffect(
    () => () => {
      stop();
      if (stopActivePreview === stop) stopActivePreview = null;
    },
    [stop],
  );

  return { active, start, stop, enabled };
}
