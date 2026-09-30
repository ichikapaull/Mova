"use client";

import { useEffect, useState } from "react";
import type { ActivityResponse } from "@/lib/activity";

/** Polls background activity (fast while busy). */
export function useActivity(): ActivityResponse | null {
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
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
          busy = next.scan.running || next.jobs.thumbnails.queued + next.jobs.thumbnails.running + next.jobs.previews.queued + next.jobs.previews.running > 0;
        }
      } catch {
        // retry later
      }
      if (!cancelled) timer = window.setTimeout(poll, busy ? 1000 : 4000);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  return activity;
}
