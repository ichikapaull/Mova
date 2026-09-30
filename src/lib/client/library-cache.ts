"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { LibraryPage, MediaListItem } from "@/lib/library-query";

export const LIBRARY_PAGE_SIZE = 60;

type Page = { items: MediaListItem[]; generation: number };
type Entry = {
  total: number | null;
  pages: Map<number, Page>;
  inflight: Set<number>;
  error: string | null;
  /** Generation in which the last request failed; no automatic retry until invalidated. */
  failedGeneration: number;
};

/**
 * Module-level cache of library pages keyed by query string. It survives client
 * navigations, so returning to the library renders instantly at the old scroll
 * position. Invalidation keeps stale items visible while fresh pages load.
 */
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let generation = 0;
let snapshot = 0;

function emit() {
  snapshot++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getEntry(key: string): Entry {
  let entry = cache.get(key);
  if (!entry) {
    entry = { total: null, pages: new Map(), inflight: new Set(), error: null, failedGeneration: -1 };
    cache.set(key, entry);
  }
  return entry;
}

/** Marks every cached page stale (after a mutation or a finished scan). */
export function invalidateLibraryCache(): void {
  generation++;
  // Bound memory: drop queries other than the most recent few.
  if (cache.size > 12) {
    const keys = [...cache.keys()];
    for (const key of keys.slice(0, keys.length - 12)) cache.delete(key);
  }
  emit();
}

async function fetchPage(key: string, pageIndex: number): Promise<void> {
  const entry = getEntry(key);
  if (entry.inflight.has(pageIndex)) return;
  entry.inflight.add(pageIndex);
  const requestGeneration = generation;
  try {
    const params = new URLSearchParams(key);
    params.set("offset", String(pageIndex * LIBRARY_PAGE_SIZE));
    params.set("limit", String(LIBRARY_PAGE_SIZE));
    const response = await fetch(`/api/media?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Library request failed (${response.status})`);
    const page = (await response.json()) as LibraryPage;
    entry.total = page.total;
    entry.error = null;
    entry.pages.set(pageIndex, { items: page.items, generation: requestGeneration });
  } catch (error) {
    entry.error = error instanceof Error ? error.message : "Could not load library.";
    entry.failedGeneration = requestGeneration;
  } finally {
    entry.inflight.delete(pageIndex);
    emit();
  }
}

export function useLibraryData(queryKey: string) {
  const version = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const entry = getEntry(queryKey);

  const ensureRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const current = getEntry(queryKey);
    const first = Math.floor(Math.max(0, startIndex) / LIBRARY_PAGE_SIZE);
    const last = Math.floor(Math.max(0, endIndex) / LIBRARY_PAGE_SIZE);
      for (let pageIndex = first; pageIndex <= last; pageIndex++) {
        const page = current.pages.get(pageIndex);
        if (current.failedGeneration === generation) return;
        if (!page || page.generation < generation) void fetchPage(queryKey, pageIndex);
      }
    },
    [queryKey],
  );

  // First page drives `total`.
  useEffect(() => {
    const page = entry.pages.get(0);
    if (entry.failedGeneration === generation) return;
    if (!page || page.generation < generation) void fetchPage(queryKey, 0);
  });

  // `version` changes whenever any page loads, so consumers re-render with fresh items.
  const getItem = useCallback(
    (index: number): MediaListItem | undefined => {
      void version;
      const page = getEntry(queryKey).pages.get(Math.floor(index / LIBRARY_PAGE_SIZE));
      return page?.items[index % LIBRARY_PAGE_SIZE];
    },
    [queryKey, version],
  );

  return { total: entry.total, error: entry.error, getItem, ensureRange, isCached: entry.pages.has(0) };
}

/** All ids for a query (select all / shift range selection across unloaded pages). */
export async function fetchLibraryIds(queryKey: string): Promise<number[]> {
  const params = new URLSearchParams(queryKey);
  params.set("idsOnly", "1");
  const response = await fetch(`/api/media?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load selection.");
  return ((await response.json()) as { ids: number[] }).ids;
}
