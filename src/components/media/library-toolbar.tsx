"use client";

import { ArrowDownWideNarrowIcon, ArrowUpNarrowWideIcon, Grid2X2Icon, Grid3X3Icon, LayoutGridIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { type TaxonomyData, useTaxonomy } from "@/lib/client/taxonomy";
import {
  countActiveFilters,
  defaultSortDirection,
  type LibraryQuery,
  RESOLUTION_OPTIONS,
  SORT_OPTIONS,
  type SortKey,
  WATCH_STATE_OPTIONS,
} from "@/lib/library-query";
import { normalizeSearchText } from "@/lib/search";
import type { Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const FILE_TYPES = ["mp4", "mkv", "webm", "mov", "avi", "m4v", "wmv", "ts"];

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export function LibraryToolbar({
  query,
  hiddenFilters = [],
  onChange,
  gridSize,
  onGridSizeChange,
  total,
}: {
  query: LibraryQuery;
  hiddenFilters?: Array<"categories" | "tags" | "favorite">;
  onChange: (next: LibraryQuery) => void;
  gridSize: Settings["gridSize"];
  onGridSizeChange: (size: Settings["gridSize"]) => void;
  total: number | null;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data } = useTaxonomy(filtersOpen || countActiveFilters(query) > 0);
  const hasSearch = Boolean(query.q?.trim());
  const sort: SortKey = query.sort ?? (hasSearch ? "relevance" : "added");
  const dir = query.dir ?? defaultSortDirection(sort);
  const active = countActiveFilters(query);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground tabular-nums">
          {total == null ? " " : `${total.toLocaleString()} ${total === 1 ? "video" : "videos"}`}
        </p>

        <Select value={sort} onValueChange={(value) => onChange({ ...query, sort: value as SortKey, dir: undefined })}>
          <SelectTrigger className="h-8 w-auto min-w-40 gap-2 text-[13px]" aria-label="Sort by">
            <span className="text-muted-foreground">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_OPTIONS.filter((option) => option.value !== "relevance" || hasSearch).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sort !== "relevance" && (
          <Tooltip content={dir === "asc" ? "Ascending" : "Descending"}>
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label="Toggle sort direction"
              onClick={() => onChange({ ...query, sort, dir: dir === "asc" ? "desc" : "asc" })}
            >
              {dir === "asc" ? <ArrowUpNarrowWideIcon /> : <ArrowDownWideNarrowIcon />}
            </Button>
          </Tooltip>
        )}

        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm" className={cn(active > 0 && "border-border-strong")}>
              <SlidersHorizontalIcon /> Filter
              {active > 0 && <Badge className="ml-0.5 bg-foreground px-1.5 text-background">{active}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
            <FilterPanel query={query} onChange={onChange} data={data} hidden={hiddenFilters} />
          </PopoverContent>
        </Popover>

        <div className="flex items-center rounded-md border border-border bg-secondary p-0.5" role="radiogroup" aria-label="Card size">
          {(
            [
              ["large", Grid2X2Icon, "Large cards"],
              ["medium", LayoutGridIcon, "Medium cards"],
              ["small", Grid3X3Icon, "Small cards"],
            ] as const
          ).map(([value, Icon, label]) => (
            <Tooltip key={value} content={label}>
              <button
                type="button"
                role="radio"
                aria-checked={gridSize === value}
                aria-label={label}
                onClick={() => onGridSizeChange(value)}
                className={cn(
                  "flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground",
                  gridSize === value && "bg-white/10 text-foreground",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {active > 0 && <ActiveFilterChips query={query} data={data} onChange={onChange} hidden={hiddenFilters} />}
    </div>
  );
}

function ActiveFilterChips({
  query,
  data,
  onChange,
  hidden,
}: {
  query: LibraryQuery;
  data: TaxonomyData | null;
  onChange: (next: LibraryQuery) => void;
  hidden: string[];
}) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (!hidden.includes("categories"))
    for (const id of query.categories ?? []) {
      chips.push({
        key: `c${id}`,
        label: data?.categories.find((c) => c.id === id)?.name ?? "Category",
        remove: () => onChange({ ...query, categories: query.categories?.filter((v) => v !== id) }),
      });
    }
  if (!hidden.includes("tags"))
    for (const id of query.tags ?? []) {
      chips.push({
        key: `t${id}`,
        label: `#${data?.tags.find((t) => t.id === id)?.name ?? "tag"}`,
        remove: () => onChange({ ...query, tags: query.tags?.filter((v) => v !== id) }),
      });
    }
  for (const id of query.sources ?? []) {
    chips.push({
      key: `s${id}`,
      label: data?.sources.find((s) => s.id === id)?.name ?? "Folder",
      remove: () => onChange({ ...query, sources: query.sources?.filter((v) => v !== id) }),
    });
  }
  for (const r of query.resolution ?? []) {
    chips.push({
      key: `r${r}`,
      label: RESOLUTION_OPTIONS.find((o) => o.value === r)?.label ?? r,
      remove: () => onChange({ ...query, resolution: query.resolution?.filter((v) => v !== r) }),
    });
  }
  for (const t of query.types ?? []) {
    chips.push({ key: `x${t}`, label: `.${t}`, remove: () => onChange({ ...query, types: query.types?.filter((v) => v !== t) }) });
  }
  if (query.favorite && !hidden.includes("favorite")) chips.push({ key: "fav", label: "Favorites", remove: () => onChange({ ...query, favorite: undefined }) });
  if (query.watch)
    chips.push({
      key: "watch",
      label: WATCH_STATE_OPTIONS.find((o) => o.value === query.watch)?.label ?? query.watch,
      remove: () => onChange({ ...query, watch: undefined }),
    });
  if (query.missing) chips.push({ key: "missing", label: "Missing files", remove: () => onChange({ ...query, missing: undefined }) });
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-white/[0.04] py-1 pr-2 pl-2.5 text-xs text-foreground/90 transition-colors hover:bg-white/[0.08]"
        >
          {chip.label}
          <XIcon className="size-3 text-muted-foreground" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          className="px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onChange({ q: query.q, sort: query.sort, dir: query.dir })}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <p className="mb-2 text-[11px] font-medium tracking-wider text-subtle-foreground uppercase">{title}</p>
      {children}
    </div>
  );
}

function CheckRow({ checked, onChange, label, count }: { checked: boolean; onChange: () => void; label: string; count?: number }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-[13px] hover:bg-white/[0.04]">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span className="flex-1 truncate">{label}</span>
      {count != null && <span className="text-[11px] text-subtle-foreground tabular-nums">{count}</span>}
    </label>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? "border-foreground bg-foreground text-background" : "border-border-strong text-foreground/80 hover:bg-white/[0.06]",
      )}
    >
      {children}
    </button>
  );
}

function FilterPanel({
  query,
  onChange,
  data,
  hidden,
}: {
  query: LibraryQuery;
  onChange: (next: LibraryQuery) => void;
  data: TaxonomyData | null;
  hidden: string[];
}) {
  const [tagFilter, setTagFilter] = useState("");
  const tags = (data?.tags ?? [])
    .filter((tag) => tag.count > 0 || query.tags?.includes(tag.id))
    .filter((tag) => !tagFilter || normalizeSearchText(tag.name).includes(normalizeSearchText(tagFilter)))
    .slice(0, 40);

  if (!data) return <p className="p-6 text-center text-sm text-muted-foreground">Loading filters…</p>;

  return (
    <div className="max-h-[min(70vh,560px)] overflow-y-auto">
      {!hidden.includes("categories") && data.categories.length > 0 && (
        <FilterSection title="Category">
          <div className="grid grid-cols-2 gap-x-2">
            {data.categories.map((category) => (
              <CheckRow
                key={category.id}
                label={category.name}
                count={category.count}
                checked={query.categories?.includes(category.id) ?? false}
                onChange={() => onChange({ ...query, categories: toggle(query.categories, category.id) })}
              />
            ))}
          </div>
        </FilterSection>
      )}
      {!hidden.includes("tags") && data.tags.length > 0 && (
        <FilterSection title="Tags (match all)">
          {data.tags.length > 10 && (
            <Input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Find tag…" className="mb-2 h-8" />
          )}
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Pill key={tag.id} active={query.tags?.includes(tag.id) ?? false} onClick={() => onChange({ ...query, tags: toggle(query.tags, tag.id) })}>
                {tag.name}
              </Pill>
            ))}
          </div>
        </FilterSection>
      )}
      {data.sources.length > 1 && (
        <FilterSection title="Folder">
          {data.sources.map((source) => (
            <CheckRow
              key={source.id}
              label={source.name}
              count={source.count}
              checked={query.sources?.includes(source.id) ?? false}
              onChange={() => onChange({ ...query, sources: toggle(query.sources, source.id) })}
            />
          ))}
        </FilterSection>
      )}
      <FilterSection title="Resolution">
        <div className="flex flex-wrap gap-1.5">
          {RESOLUTION_OPTIONS.map((option) => (
            <Pill
              key={option.value}
              active={query.resolution?.includes(option.value) ?? false}
              onClick={() => onChange({ ...query, resolution: toggle(query.resolution, option.value) })}
            >
              {option.label}
            </Pill>
          ))}
        </div>
      </FilterSection>
      <FilterSection title="File type">
        <div className="flex flex-wrap gap-1.5">
          {FILE_TYPES.map((type) => (
            <Pill key={type} active={query.types?.includes(type) ?? false} onClick={() => onChange({ ...query, types: toggle(query.types, type) })}>
              .{type}
            </Pill>
          ))}
        </div>
      </FilterSection>
      <FilterSection title="Watch status">
        <div className="flex flex-wrap gap-1.5">
          {WATCH_STATE_OPTIONS.map((option) => (
            <Pill
              key={option.value}
              active={query.watch === option.value}
              onClick={() => onChange({ ...query, watch: query.watch === option.value ? undefined : option.value })}
            >
              {option.label}
            </Pill>
          ))}
        </div>
      </FilterSection>
      <FilterSection title="Other">
        {!hidden.includes("favorite") && (
          <label className="flex items-center justify-between py-1 text-[13px]">
            Favorites only
            <Switch checked={query.favorite ?? false} onCheckedChange={(v) => onChange({ ...query, favorite: v || undefined })} />
          </label>
        )}
        <label className="flex items-center justify-between py-1 text-[13px]">
          Show missing files instead
          <Switch checked={query.missing ?? false} onCheckedChange={(v) => onChange({ ...query, missing: v || undefined })} />
        </label>
      </FilterSection>
    </div>
  );
}
