"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/ui/kbd";

/** Pages that render a MediaBrowser and filter in place. */
const BROWSER_PATHS = [/^\/library$/, /^\/recent$/, /^\/favorites$/, /^\/tags\/\d+$/, /^\/categories\/\d+$/];

/**
 * Search box in the top bar. On library-like pages it filters in place via the
 * `q` URL parameter (debounced); elsewhere it jumps to the library.
 */
export function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const onBrowserPage = BROWSER_PATHS.some((re) => re.test(pathname));
  const urlQuery = onBrowserPage ? (searchParams.get("q") ?? "") : "";
  const [value, setValue] = useState(urlQuery);
  const debounce = useRef<number>(0);
  const lastPushed = useRef(urlQuery);

  // Follow external URL changes (back/forward, "clear filters").
  useEffect(() => {
    if (urlQuery !== lastPushed.current) {
      setValue(urlQuery);
      lastPushed.current = urlQuery;
    }
  }, [urlQuery]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, [contenteditable]");
      if ((event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const apply = (next: string) => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      const trimmed = next.trim();
      lastPushed.current = trimmed;
      if (onBrowserPage) {
        const params = new URLSearchParams(searchParams.toString());
        if (trimmed) params.set("q", trimmed);
        else params.delete("q");
        // Relevance is the natural order while searching.
        if (!trimmed && params.get("sort") === "relevance") params.delete("sort");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        window.scrollTo({ top: 0 });
      } else if (trimmed) {
        router.push(`/library?q=${encodeURIComponent(trimmed)}`);
      }
    }, onBrowserPage ? 180 : 350);
  };

  return (
    <div className="relative w-full max-w-md">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder="Search videos, tags, series…"
        aria-label="Search library"
        onChange={(event) => {
          setValue(event.target.value);
          apply(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !onBrowserPage && value.trim()) {
            window.clearTimeout(debounce.current);
            router.push(`/library?q=${encodeURIComponent(value.trim())}`);
          }
          if (event.key === "Escape") {
            if (value) {
              setValue("");
              apply("");
            } else inputRef.current?.blur();
          }
        }}
        className="h-9 w-full rounded-lg border border-transparent bg-white/[0.05] pr-16 pl-9 text-sm outline-none transition-[background-color,border-color] duration-150 placeholder:text-subtle-foreground hover:bg-white/[0.07] focus:border-border-strong focus:bg-white/[0.07] [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              apply("");
              inputRef.current?.focus();
            }}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : (
          <Kbd>/</Kbd>
        )}
      </div>
    </div>
  );
}
