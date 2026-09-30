import { z } from "zod";

export const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "name", label: "Name" },
  { value: "added", label: "Date added" },
  { value: "modified", label: "Date modified" },
  { value: "duration", label: "Duration" },
  { value: "size", label: "File size" },
  { value: "watched", label: "Recently watched" },
] as const;

export const RESOLUTION_OPTIONS = [
  { value: "sd", label: "SD (< 720p)" },
  { value: "hd", label: "720p" },
  { value: "fhd", label: "1080p" },
  { value: "uhd", label: "1440p / 4K" },
] as const;

export const WATCH_STATE_OPTIONS = [
  { value: "unwatched", label: "Unwatched" },
  { value: "in-progress", label: "In progress" },
  { value: "watched", label: "Watched" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];
export type ResolutionKey = (typeof RESOLUTION_OPTIONS)[number]["value"];
export type WatchState = (typeof WATCH_STATE_OPTIONS)[number]["value"];

const idList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map(Number)
      .filter((n) => Number.isSafeInteger(n) && n > 0),
  )
  .pipe(z.array(z.number()).max(50));

const enumList = <T extends string>(values: readonly T[]) =>
  z
    .string()
    .transform((value) => value.split(",").filter((v): v is T => (values as readonly string[]).includes(v)));

/** Library filters, serialized into the URL so back navigation restores them. */
export const libraryQuerySchema = z.object({
  q: z.string().max(200).optional().catch(undefined),
  sort: z.enum(SORT_OPTIONS.map((o) => o.value) as [SortKey, ...SortKey[]]).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  categories: idList.optional().catch(undefined),
  tags: idList.optional().catch(undefined),
  sources: idList.optional().catch(undefined),
  resolution: enumList(RESOLUTION_OPTIONS.map((o) => o.value)).optional().catch(undefined),
  types: z
    .string()
    .transform((v) => v.split(",").filter((t) => /^[a-z0-9]{1,5}$/.test(t)))
    .optional()
    .catch(undefined),
  favorite: z
    .enum(["1"])
    .transform(() => true)
    .optional()
    .catch(undefined),
  watch: z.enum(WATCH_STATE_OPTIONS.map((o) => o.value) as [WatchState, ...WatchState[]]).optional().catch(undefined),
  missing: z
    .enum(["1"])
    .transform(() => true)
    .optional()
    .catch(undefined),
});

export type LibraryQuery = z.infer<typeof libraryQuerySchema>;

export function parseLibraryQuery(params: URLSearchParams | Record<string, string | string[] | undefined>): LibraryQuery {
  const record: Record<string, string> = {};
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => {
      record[key] = value;
    });
  } else {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") record[key] = value;
      else if (Array.isArray(value) && value[0]) record[key] = value[0];
    }
  }
  const parsed = libraryQuerySchema.safeParse(record);
  return parsed.success ? parsed.data : {};
}

/** Serializes a query to URLSearchParams, omitting empty values. Stable key order. */
export function serializeLibraryQuery(query: LibraryQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.sort) params.set("sort", query.sort);
  if (query.dir) params.set("dir", query.dir);
  if (query.categories?.length) params.set("categories", query.categories.join(","));
  if (query.tags?.length) params.set("tags", query.tags.join(","));
  if (query.sources?.length) params.set("sources", query.sources.join(","));
  if (query.resolution?.length) params.set("resolution", query.resolution.join(","));
  if (query.types?.length) params.set("types", query.types.join(","));
  if (query.favorite) params.set("favorite", "1");
  if (query.watch) params.set("watch", query.watch);
  if (query.missing) params.set("missing", "1");
  return params;
}

export function countActiveFilters(query: LibraryQuery): number {
  return (
    (query.categories?.length ?? 0) +
    (query.tags?.length ?? 0) +
    (query.sources?.length ?? 0) +
    (query.resolution?.length ?? 0) +
    (query.types?.length ?? 0) +
    (query.favorite ? 1 : 0) +
    (query.watch ? 1 : 0) +
    (query.missing ? 1 : 0)
  );
}

/** Default direction when a sort key is chosen without an explicit direction. */
export function defaultSortDirection(sort: SortKey): "asc" | "desc" {
  return sort === "name" || sort === "relevance" ? "asc" : "desc";
}

/** Lightweight shape rendered by media cards. */
export type MediaListItem = {
  id: number;
  title: string;
  extension: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fileSize: number;
  isFavorite: boolean;
  status: "available" | "missing" | "removed";
  sourceOnline: boolean;
  thumbnailStatus: "pending" | "ready" | "failed";
  previewStatus: "pending" | "ready" | "failed";
  /** Cache-buster for thumbnail/preview URLs. */
  version: number;
  categoryName: string | null;
  progressSec: number | null;
  completed: boolean;
  createdAt: number;
  episodeLabel?: string | null;
};

export type LibraryPage = { total: number; offset: number; items: MediaListItem[] };
