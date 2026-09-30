"use client";

import { useCallback, useEffect, useRef } from "react";

type Report = { positionSec: number; durationSec: number | null; sessionStart?: boolean; ended?: boolean };

/**
 * Persists playback position: throttled while playing, immediately on pause/seek/end,
 * and via sendBeacon when the tab is hidden or the player unmounts.
 */
export function useProgressReporter(mediaId: number, getVideo: () => HTMLVideoElement | null) {
  const lastSent = useRef({ at: 0, position: -1 });
  const sessionStarted = useRef(false);
  // Last known position; the <video> ref is already detached when unmount cleanup runs.
  const latest = useRef<Report | null>(null);

  const url = `/api/media/${mediaId}/progress`;

  const snapshot = useCallback((): Report | null => {
    const video = getVideo();
    if (video && Number.isFinite(video.currentTime) && video.readyState > 0) {
      latest.current = { positionSec: video.currentTime, durationSec: Number.isFinite(video.duration) ? video.duration : null };
    }
    return latest.current;
  }, [getVideo]);

  const send = useCallback(
    (report: Report, beacon = false) => {
      lastSent.current = { at: Date.now(), position: report.positionSec };
      const body = JSON.stringify(report);
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
        return;
      }
      void fetch(url, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
    },
    [url],
  );

  const reportNow = useCallback(
    (extra: Partial<Report> = {}, beacon = false) => {
      const base = snapshot();
      if (!base) return;
      // Skip the very beginning so opening a video by accident doesn't create history.
      if (!extra.ended && !sessionStarted.current && base.positionSec < 3) return;
      const sessionStart = !sessionStarted.current;
      sessionStarted.current = true;
      send({ ...base, ...extra, sessionStart: sessionStart || undefined }, beacon);
    },
    [send, snapshot],
  );

  /** Call from `timeupdate`; sends at most every 5 seconds of wall time. */
  const onTimeUpdate = useCallback(() => {
    const base = snapshot();
    if (!base) return;
    if (Date.now() - lastSent.current.at >= 5000 && Math.abs(base.positionSec - lastSent.current.position) >= 1) reportNow();
  }, [reportNow, snapshot]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") reportNow({}, true);
    };
    const onPageHide = () => reportNow({}, true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      reportNow({}, true);
    };
  }, [reportNow]);

  return { reportNow, onTimeUpdate };
}
