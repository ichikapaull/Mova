"use client";

import { ArrowUpIcon, FolderIcon, HardDriveIcon, HomeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Listing = { path: string; parent: string | null; folders: string[]; videoCount: number; shortcuts: string[] };

/** Minimal server-side directory browser (local only) for choosing media folders. */
export function FolderBrowser({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string>(value || "");

  useEffect(() => {
    const controller = new AbortController();
    const params = current ? `?path=${encodeURIComponent(current)}` : "";
    fetch(`/api/fs/dirs${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as Listing & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Cannot open folder");
        setListing(body);
        setError(null);
        if (!value || value !== body.path) onChange(body.path);
      })
      .catch((err: unknown) => {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      });
    return () => controller.abort();
    // `onChange`/`value` intentionally excluded: navigation drives the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const join = (base: string, name: string) => `${base === "/" ? "" : base}/${name}`;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black/20">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <button
          type="button"
          disabled={!listing?.parent}
          onClick={() => listing?.parent && setCurrent(listing.parent)}
          className="rounded p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground disabled:opacity-30"
          aria-label="Parent folder"
        >
          <ArrowUpIcon className="size-4" />
        </button>
        {listing?.shortcuts.map((shortcut, i) => (
          <button
            key={shortcut}
            type="button"
            onClick={() => setCurrent(shortcut)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
          >
            {i === 0 ? <HomeIcon className="size-3.5" /> : <HardDriveIcon className="size-3.5" />}
            {i === 0 ? "Home" : shortcut}
          </button>
        ))}
      </div>
      <div className="h-56 overflow-y-auto p-1">
        {error && <p className="p-3 text-sm text-destructive">{error}</p>}
        {listing && listing.folders.length === 0 && !error && (
          <p className="p-3 text-sm text-muted-foreground">No sub-folders{listing.videoCount ? ` · ${listing.videoCount} videos here` : ""}.</p>
        )}
        {listing?.folders.map((name) => (
          <button
            key={name}
            type="button"
            onDoubleClick={() => setCurrent(join(listing.path, name))}
            onClick={() => setCurrent(join(listing.path, name))}
            className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-white/[0.06]")}
          >
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{name}</span>
          </button>
        ))}
      </div>
      {listing && (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {listing.videoCount > 0 ? `${listing.videoCount} video file(s) directly in this folder · ` : ""}sub-folders are scanned too
        </div>
      )}
    </div>
  );
}
