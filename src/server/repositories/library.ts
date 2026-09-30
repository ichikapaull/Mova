import { and, asc, count, desc, eq, exists, gt, inArray, isNull, lt, not, or, type SQL, sql } from "drizzle-orm";
import {
  defaultSortDirection,
  type LibraryPage,
  type LibraryQuery,
  type MediaListItem,
  type ResolutionKey,
} from "@/lib/library-query";
import { escapeLike, tokenizeSearchQuery } from "@/lib/search";
import { getDb, schema } from "@/server/db";

const m = schema.media;
const src = schema.mediaSources;
const wh = schema.watchHistory;

const listColumns = {
  id: m.id,
  title: m.displayTitle,
  extension: m.extension,
  durationSec: m.durationSec,
  width: m.width,
  height: m.height,
  fileSize: m.fileSize,
  isFavorite: m.isFavorite,
  status: m.status,
  sourceOnline: src.isOnline,
  thumbnailStatus: m.thumbnailStatus,
  previewStatus: m.previewStatus,
  fileModifiedAt: m.fileModifiedAt,
  createdAt: m.createdAt,
  progressSec: wh.positionSec,
  completed: wh.completed,
  categoryName: sql<string | null>`(
    select c.name from media_categories mc
    join categories c on c.id = mc.category_id
    where mc.media_id = ${m.id}
    order by c.sort_order, c.name limit 1
  )`,
};

function toListItem(row: {
  id: number;
  title: string;
  extension: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fileSize: number;
  isFavorite: boolean;
  status: MediaListItem["status"];
  sourceOnline: boolean;
  thumbnailStatus: MediaListItem["thumbnailStatus"];
  previewStatus: MediaListItem["previewStatus"];
  fileModifiedAt: number;
  createdAt: number;
  progressSec: number | null;
  completed: boolean | null;
  categoryName: string | null;
}): MediaListItem {
  return {
    id: row.id,
    title: row.title,
    extension: row.extension,
    durationSec: row.durationSec,
    width: row.width,
    height: row.height,
    fileSize: row.fileSize,
    isFavorite: row.isFavorite,
    status: row.status,
    sourceOnline: row.sourceOnline,
    thumbnailStatus: row.thumbnailStatus,
    previewStatus: row.previewStatus,
    version: Math.floor(row.fileModifiedAt / 1000),
    categoryName: row.categoryName,
    progressSec: row.progressSec,
    completed: row.completed ?? false,
    createdAt: row.createdAt,
  };
}

function baseSelect() {
  return getDb()
    .select(listColumns)
    .from(m)
    .innerJoin(src, eq(src.id, m.sourceId))
    .leftJoin(wh, eq(wh.mediaId, m.id));
}

/** Only media from enabled sources that are on disk (or explicitly requested missing ones). */
function visibilityCondition(includeMissing = false): SQL {
  return and(eq(src.enabled, true), includeMissing ? eq(m.status, "missing") : eq(m.status, "available"))!;
}

function resolutionCondition(key: ResolutionKey): SQL {
  const shortSide = sql`min(${m.width}, ${m.height})`;
  switch (key) {
    case "sd":
      return sql`${shortSide} < 700`;
    case "hd":
      return sql`${shortSide} >= 700 and ${shortSide} < 1000`;
    case "fhd":
      return sql`${shortSide} >= 1000 and ${shortSide} < 1400`;
    case "uhd":
      return sql`${shortSide} >= 1400`;
  }
}

function searchCondition(token: string): SQL {
  const pattern = `%${escapeLike(token)}%`;
  return or(
    sql`${m.searchText} like ${pattern} escape '\\'`,
    sql`exists (select 1 from media_tags mt join tags t on t.id = mt.tag_id
      where mt.media_id = ${m.id} and lower(t.name) like ${pattern} escape '\\')`,
    sql`exists (select 1 from media_categories mc join categories c on c.id = mc.category_id
      where mc.media_id = ${m.id} and lower(c.name) like ${pattern} escape '\\')`,
    sql`exists (select 1 from series_episodes se join series s on s.id = se.series_id
      where se.media_id = ${m.id} and lower(s.title) like ${pattern} escape '\\')`,
  )!;
}

export function buildLibraryConditions(query: LibraryQuery): SQL {
  const conditions: SQL[] = [visibilityCondition(query.missing)];

  for (const token of tokenizeSearchQuery(query.q ?? "")) conditions.push(searchCondition(token));

  if (query.categories?.length) {
    conditions.push(
      exists(
        getDb()
          .select({ one: sql`1` })
          .from(schema.mediaCategories)
          .where(
            and(eq(schema.mediaCategories.mediaId, m.id), inArray(schema.mediaCategories.categoryId, query.categories)),
          ),
      ),
    );
  }
  // Tags narrow: a video must have every selected tag.
  for (const tagId of query.tags ?? []) {
    conditions.push(
      exists(
        getDb()
          .select({ one: sql`1` })
          .from(schema.mediaTags)
          .where(and(eq(schema.mediaTags.mediaId, m.id), eq(schema.mediaTags.tagId, tagId))),
      ),
    );
  }
  if (query.sources?.length) conditions.push(inArray(m.sourceId, query.sources));
  if (query.resolution?.length) conditions.push(or(...query.resolution.map(resolutionCondition))!);
  if (query.types?.length) conditions.push(inArray(m.extension, query.types));
  if (query.favorite) conditions.push(eq(m.isFavorite, true));
  if (query.watch === "watched") conditions.push(eq(wh.completed, true));
  if (query.watch === "in-progress") conditions.push(and(eq(wh.completed, false), gt(wh.positionSec, 5))!);
  if (query.watch === "unwatched") {
    conditions.push(or(isNull(wh.mediaId), and(eq(wh.completed, false), lt(wh.positionSec, 5)))!);
  }
  return and(...conditions)!;
}

function buildOrderBy(query: LibraryQuery): SQL[] {
  const hasSearch = Boolean(query.q?.trim());
  const sort = query.sort ?? (hasSearch ? "relevance" : "added");
  const direction = query.dir ?? defaultSortDirection(sort);
  const dir = direction === "asc" ? asc : desc;
  const byTitle = sql`${m.displayTitle} collate nocase asc`;

  switch (sort) {
    case "relevance": {
      if (!hasSearch) return [desc(m.createdAt), desc(m.id)];
      const phrase = escapeLike(tokenizeSearchQuery(query.q ?? "").join(" "));
      return [
        sql`case when ${m.searchText} like ${`${phrase}%`} escape '\\' then 0
                 when ${m.searchText} like ${`%${phrase}%`} escape '\\' then 1 else 2 end`,
        byTitle,
      ];
    }
    case "name":
      return [sql`${m.displayTitle} collate nocase ${sql.raw(direction)}`, asc(m.id)];
    case "added":
      return [dir(m.createdAt), dir(m.id)];
    case "modified":
      return [dir(m.fileModifiedAt), dir(m.id)];
    case "duration":
      return [sql`${m.durationSec} is null`, dir(m.durationSec), byTitle];
    case "size":
      return [dir(m.fileSize), byTitle];
    case "watched":
      return [sql`${wh.lastWatchedAt} is null`, dir(wh.lastWatchedAt), desc(m.createdAt)];
  }
}

export function queryLibrary(query: LibraryQuery, offset: number, limit: number): LibraryPage {
  const where = buildLibraryConditions(query);
  const db = getDb();
  const [{ total } = { total: 0 }] = db
    .select({ total: count() })
    .from(m)
    .innerJoin(src, eq(src.id, m.sourceId))
    .leftJoin(wh, eq(wh.mediaId, m.id))
    .where(where)
    .all();
  const rows = baseSelect()
    .where(where)
    .orderBy(...buildOrderBy(query))
    .limit(limit)
    .offset(offset)
    .all();
  return { total, offset, items: rows.map(toListItem) };
}

/** All ids matching a query, in display order (used for select-all / range select). */
export function queryLibraryIds(query: LibraryQuery): number[] {
  return getDb()
    .select({ id: m.id })
    .from(m)
    .innerJoin(src, eq(src.id, m.sourceId))
    .leftJoin(wh, eq(wh.mediaId, m.id))
    .where(buildLibraryConditions(query))
    .orderBy(...buildOrderBy(query))
    .all()
    .map((row) => row.id);
}

// ---------------------------------------------------------------------------
// Home rows
// ---------------------------------------------------------------------------

export function listContinueWatching(limit = 20, completedThreshold = 0.92): MediaListItem[] {
  return baseSelect()
    .where(
      and(
        visibilityCondition(),
        eq(wh.completed, false),
        gt(wh.positionSec, 5),
        or(isNull(m.durationSec), sql`${wh.positionSec} < ${m.durationSec} * ${completedThreshold}`),
      ),
    )
    .orderBy(desc(wh.lastWatchedAt))
    .limit(limit)
    .all()
    .map(toListItem);
}

export function listRecentlyAdded(limit = 24): MediaListItem[] {
  return baseSelect().where(visibilityCondition()).orderBy(desc(m.createdAt), desc(m.id)).limit(limit).all().map(toListItem);
}

export function listFavorites(limit = 24): MediaListItem[] {
  return baseSelect()
    .where(and(visibilityCondition(), eq(m.isFavorite, true)))
    .orderBy(desc(m.favoritedAt), desc(m.id))
    .limit(limit)
    .all()
    .map(toListItem);
}

export function listShortVideos(maxDurationSec = 300, limit = 24): MediaListItem[] {
  return baseSelect()
    .where(and(visibilityCondition(), sql`${m.durationSec} <= ${maxDurationSec}`))
    .orderBy(desc(m.createdAt))
    .limit(limit)
    .all()
    .map(toListItem);
}

export function listByCategory(categoryId: number, limit = 24): MediaListItem[] {
  return baseSelect()
    .where(
      and(
        visibilityCondition(),
        exists(
          getDb()
            .select({ one: sql`1` })
            .from(schema.mediaCategories)
            .where(and(eq(schema.mediaCategories.mediaId, m.id), eq(schema.mediaCategories.categoryId, categoryId))),
        ),
      ),
    )
    .orderBy(desc(m.createdAt))
    .limit(limit)
    .all()
    .map(toListItem);
}

/** Fetches list items for explicit ids, preserving the given order. */
export function listMediaItemsByIds(ids: number[], options: { includeUnavailable?: boolean } = {}): MediaListItem[] {
  if (ids.length === 0) return [];
  const rows = baseSelect()
    .where(
      options.includeUnavailable
        ? and(inArray(m.id, ids), not(eq(m.status, "removed")))
        : and(inArray(m.id, ids), visibilityCondition()),
    )
    .all();
  const byId = new Map(rows.map((row) => [row.id, toListItem(row)]));
  return ids.map((id) => byId.get(id)).filter((item): item is MediaListItem => Boolean(item));
}

export function countVisibleMedia(): number {
  const [row] = getDb()
    .select({ total: count() })
    .from(m)
    .innerJoin(src, eq(src.id, m.sourceId))
    .where(visibilityCondition())
    .all();
  return row?.total ?? 0;
}
