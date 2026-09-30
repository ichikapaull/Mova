"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { SearchXIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BulkActionBar } from "@/components/media/bulk-action-bar";
import { LibraryToolbar } from "@/components/media/library-toolbar";
import { MediaCard, MediaCardSkeleton } from "@/components/media/media-card";
import { useGridLayout } from "@/components/media/use-grid-layout";
import { useClientSettings } from "@/components/settings-context";
import { Button } from "@/components/ui/button";
import { fetchLibraryIds, invalidateLibraryCache, useLibraryData } from "@/lib/client/library-cache";
import { callAction } from "@/lib/client/run-action";
import { type LibraryQuery, type MediaListItem, parseLibraryQuery, serializeLibraryQuery } from "@/lib/library-query";
import type { Settings } from "@/lib/settings";
import { updateSettingsAction } from "@/server/actions/library";

const EMPTY_SELECTION: ReadonlySet<number> = new Set();

type PresetFilter = Pick<LibraryQuery, "categories" | "tags" | "favorite" | "sort" | "dir">;

/**
 * Filterable, virtualized grid of the whole library (or a preset slice of it such
 * as one tag or category). Filter state lives in the URL, loaded pages in a
 * module cache, and the scroll position in sessionStorage — so navigating to a
 * video and back lands exactly where the user left off.
 */
export function MediaBrowser({ preset = {}, emptyMessage }: { preset?: PresetFilter; emptyMessage?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const settings = useClientSettings();
  const [gridSize, setGridSize] = useState<Settings["gridSize"]>(settings.gridSize);
  const [, startTransition] = useTransition();

  const urlQuery = useMemo(() => parseLibraryQuery(new URLSearchParams(searchParams.toString())), [searchParams]);
  const effectiveQuery = useMemo<LibraryQuery>(
    () => ({
      ...urlQuery,
      sort: urlQuery.sort ?? preset.sort,
      dir: urlQuery.dir ?? (urlQuery.sort ? undefined : preset.dir),
      categories: [...new Set([...(preset.categories ?? []), ...(urlQuery.categories ?? [])])],
      tags: [...new Set([...(preset.tags ?? []), ...(urlQuery.tags ?? [])])],
      favorite: preset.favorite || urlQuery.favorite,
    }),
    [urlQuery, preset.categories, preset.tags, preset.favorite, preset.sort, preset.dir],
  );
  const queryKey = serializeLibraryQuery(effectiveQuery).toString();
  const { total, error, getItem, ensureRange, isCached } = useLibraryData(queryKey);

  const updateQuery = useCallback(
    (next: LibraryQuery) => {
      // Preset filters are implied by the page and never written to the URL.
      const clean: LibraryQuery = {
        ...next,
        categories: next.categories?.filter((id) => !preset.categories?.includes(id)),
        tags: next.tags?.filter((id) => !preset.tags?.includes(id)),
        favorite: preset.favorite ? undefined : next.favorite,
      };
      const qs = serializeLibraryQuery(clean).toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
      window.scrollTo({ top: 0 });
    },
    [pathname, preset.categories, preset.tags, preset.favorite, router],
  );

  // --- Grid virtualization -------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useGridLayout(containerRef, gridSize);
  const rowCount = total ? Math.ceil(total / layout.columns) : 0;
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (el) setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
  }, [layout.width, total]);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => layout.rowHeight,
    overscan: 3,
    scrollMargin,
  });
  useEffect(() => virtualizer.measure(), [layout.rowHeight, virtualizer]);

  const virtualRows = virtualizer.getVirtualItems();
  const firstRow = virtualRows[0]?.index ?? 0;
  const lastRow = virtualRows.at(-1)?.index ?? 0;
  useEffect(() => {
    if (total) ensureRange(firstRow * layout.columns, (lastRow + 2) * layout.columns);
  }, [firstRow, lastRow, layout.columns, total, ensureRange]);

  // --- Scroll restoration ----------------------------------------------------
  const scrollKey = `mova-scroll:${pathname}?${queryKey}`;
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || total == null) return;
    restored.current = true;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(scrollKey);
    } catch {
      // Storage unavailable (private mode): start at top.
    }
    if (saved && isCached) requestAnimationFrame(() => window.scrollTo({ top: Number(saved) }));
  }, [scrollKey, total, isCached]);
  useEffect(() => {
    restored.current = false;
  }, [scrollKey]);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(scrollKey, String(Math.round(window.scrollY)));
        } catch {
          // ignore
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [scrollKey]);

  // --- Selection ---------------------------------------------------------------
  // Selection belongs to one query; changing search/filters starts fresh.
  const [selection, setSelection] = useState<{ key: string; ids: Set<number> }>({ key: queryKey, ids: new Set() });
  const selected = selection.key === queryKey ? selection.ids : EMPTY_SELECTION;
  const anchorIndex = useRef<number | null>(null);

  const updateSelection = useCallback(
    (update: (ids: ReadonlySet<number>) => Set<number>) =>
      setSelection((prev) => ({ key: queryKey, ids: update(prev.key === queryKey ? prev.ids : EMPTY_SELECTION) })),
    [queryKey],
  );
  const clearSelection = useCallback(() => updateSelection(() => new Set()), [updateSelection]);

  const handleSelectToggle = useCallback(
    async (item: MediaListItem, event: React.MouseEvent, index?: number) => {
      const anchor = anchorIndex.current;
      if (event.shiftKey && anchor != null && index != null) {
        const [from, to] = [Math.min(anchor, index), Math.max(anchor, index)];
        const loaded: number[] = [];
        for (let i = from; i <= to; i++) {
          const entry = getItem(i);
          if (entry) loaded.push(entry.id);
        }
        const ids = loaded.length === to - from + 1 ? loaded : (await fetchLibraryIds(queryKey)).slice(from, to + 1);
        updateSelection((prev) => new Set([...prev, ...ids]));
        return;
      }
      anchorIndex.current = index ?? null;
      updateSelection((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    },
    [getItem, queryKey, updateSelection],
  );

  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable], [role=dialog], [role=menu]")) return;
      if (event.key === "Escape") clearSelection();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && total) {
        event.preventDefault();
        const ids = await fetchLibraryIds(queryKey);
        updateSelection(() => new Set(ids));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection, updateSelection, total, queryKey]);

  const changeGridSize = (size: Settings["gridSize"]) => {
    setGridSize(size);
    void callAction(updateSettingsAction({ gridSize: size }));
  };

  const selectionMode = selected.size > 0;
  const hasFilters = Boolean(urlQuery.q || serializeLibraryQuery({ ...urlQuery, q: undefined, sort: undefined, dir: undefined }).toString());

  return (
    <div className="flex flex-col gap-5">
      <LibraryToolbar
        query={effectiveQuery}
        hiddenFilters={[
          ...(preset.categories?.length ? (["categories"] as const) : []),
          ...(preset.tags?.length ? (["tags"] as const) : []),
          ...(preset.favorite ? (["favorite"] as const) : []),
        ]}
        onChange={updateQuery}
        gridSize={gridSize}
        onGridSizeChange={changeGridSize}
        total={total}
      />

      {error && total == null && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <span>Could not load the library: {error}</span>
          <Button variant="secondary" size="sm" onClick={invalidateLibraryCache}>
            Retry
          </Button>
        </div>
      )}

      {total === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <SearchXIcon className="size-10 text-subtle-foreground" strokeWidth={1.5} />
          {hasFilters ? (
            <>
              <p className="text-base font-medium">No videos match</p>
              <p className="text-sm text-muted-foreground">Try a different search or remove some filters.</p>
              <Button variant="secondary" size="sm" onClick={() => updateQuery({})}>
                Clear search & filters
              </Button>
            </>
          ) : (
            (emptyMessage ?? <p className="text-sm text-muted-foreground">Nothing here yet.</p>)
          )}
        </div>
      )}

      <div ref={containerRef} className="relative w-full" style={{ height: total == null ? undefined : virtualizer.getTotalSize() }}>
        {total == null && (
          <div className="grid gap-x-4 gap-y-6" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: layout.columns * 3 }, (_, i) => (
              <MediaCardSkeleton key={i} />
            ))}
          </div>
        )}
        {virtualRows.map((row) => (
          <div
            key={row.key}
            className="absolute inset-x-0 grid gap-x-4"
            style={{
              top: row.start - scrollMargin,
              height: layout.rowHeight,
              gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: layout.columns }, (_, column) => {
              const index = row.index * layout.columns + column;
              if (total != null && index >= total) return <div key={column} />;
              const item = getItem(index);
              if (!item) return <MediaCardSkeleton key={column} />;
              return (
                <MediaCard
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  selectionMode={selectionMode}
                  index={index}
                  onSelectToggle={handleSelectToggle}
                />
              );
            })}
          </div>
        ))}
      </div>

      {selectionMode && <BulkActionBar ids={[...selected]} onClear={clearSelection} />}
    </div>
  );
}
