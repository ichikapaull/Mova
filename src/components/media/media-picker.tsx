"use client";

import { CheckIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/format";
import type { LibraryPage, MediaListItem } from "@/lib/library-query";
import { cn } from "@/lib/utils";

/** Searchable library picker used for adding episodes and linking related videos. */
export function MediaPickerDialog({
  title,
  description,
  multiple,
  excludeIds = [],
  confirmLabel,
  onConfirm,
  children,
}: {
  title: string;
  description?: string;
  multiple?: boolean;
  excludeIds?: number[];
  confirmLabel: (count: number) => string;
  onConfirm: (ids: number[]) => Promise<void> | void;
  /** Extra controls rendered above the results (e.g. relation type). */
  children?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaListItem[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: "60" });
      if (query.trim()) params.set("q", query.trim());
      else params.set("sort", "added");
      fetch(`/api/media?${params.toString()}`, { signal: controller.signal })
        .then((r) => r.json() as Promise<LibraryPage>)
        .then((page) => setResults(page.items))
        .catch(() => undefined);
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const excluded = new Set(excludeIds);
  const toggle = (id: number) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : multiple ? [...current, id] : [id]));

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your library…" className="pl-9" />
      </div>
      <div className="-mx-1 h-[min(50vh,420px)] overflow-y-auto">
        {results?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No videos found.</p>}
        {results
          ?.filter((item) => !excluded.has(item.id))
          .map((item) => {
            const isSelected = selected.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]",
                  isSelected && "bg-white/[0.07]",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong",
                    isSelected && "border-foreground bg-foreground text-background",
                  )}
                >
                  {isSelected && <CheckIcon className="size-3" strokeWidth={3} />}
                </span>
                <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded bg-surface">
                  <MediaThumbnail item={item} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">{formatDuration(item.durationSec)}</span>
                </span>
              </button>
            );
          })}
      </div>
      <DialogFooter>
        <Button
          disabled={busy || selected.length === 0}
          onClick={async () => {
            setBusy(true);
            await onConfirm(selected);
            setBusy(false);
          }}
        >
          {confirmLabel(selected.length)}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
