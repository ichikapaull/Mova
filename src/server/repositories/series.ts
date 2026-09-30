import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { parseEpisodeFromFilename } from "@/lib/episode-parser";
import { formatEpisodeLabel } from "@/lib/format";
import type { MediaListItem } from "@/lib/library-query";
import { type EpisodeOrderFields, findAdjacentEpisodes, positionsByEpisodeNumber, sortEpisodes } from "@/lib/series-order";
import { getDb, schema } from "@/server/db";
import { listMediaItemsByIds } from "@/server/repositories/library";

const s = schema.series;
const se = schema.seriesEpisodes;

export type SeriesSummary = {
  id: number;
  title: string;
  description: string | null;
  episodeCount: number;
  watchedCount: number;
  posterMediaId: number | null;
  updatedAt: number;
};

export function listSeries(): SeriesSummary[] {
  return getDb()
    .select({
      id: s.id,
      title: s.title,
      description: s.description,
      updatedAt: s.updatedAt,
      episodeCount: sql<number>`count(${se.mediaId})`,
      watchedCount: sql<number>`count(case when exists (
        select 1 from watch_history w where w.media_id = ${se.mediaId} and w.completed = 1) then 1 end)`,
      posterMediaId: sql<number | null>`coalesce(${s.posterMediaId}, (
        select x.media_id from series_episodes x join media mm on mm.id = x.media_id
        where x.series_id = ${s.id} and mm.thumbnail_status = 'ready' and mm.status = 'available'
        order by coalesce(x.season_number, -1), x.position limit 1))`,
    })
    .from(s)
    .leftJoin(se, eq(se.seriesId, s.id))
    .groupBy(s.id)
    .orderBy(sql`${s.title} collate nocase`)
    .all()
    .map((row) => ({ ...row, episodeCount: Number(row.episodeCount), watchedCount: Number(row.watchedCount) }));
}

type EpisodeRow = EpisodeOrderFields & { seriesId: number };

function loadEpisodes(seriesId: number): EpisodeRow[] {
  return getDb()
    .select({
      seriesId: se.seriesId,
      mediaId: se.mediaId,
      seasonNumber: se.seasonNumber,
      episodeNumber: se.episodeNumber,
      position: se.position,
      title: schema.media.displayTitle,
    })
    .from(se)
    .innerJoin(schema.media, eq(schema.media.id, se.mediaId))
    .where(and(eq(se.seriesId, seriesId), sql`${schema.media.status} != 'removed'`))
    .all();
}

export type SeriesEpisode = MediaListItem & {
  seasonNumber: number | null;
  episodeNumber: number | null;
  position: number;
};

export function getSeries(id: number) {
  const series = getDb().select().from(s).where(eq(s.id, id)).get();
  if (!series) return null;
  const episodes = sortEpisodes(loadEpisodes(id));
  const items = new Map(listMediaItemsByIds(episodes.map((e) => e.mediaId), { includeUnavailable: true }).map((i) => [i.id, i]));
  const merged: SeriesEpisode[] = episodes.flatMap((episode) => {
    const item = items.get(episode.mediaId);
    if (!item) return [];
    return [
      {
        ...item,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        position: episode.position,
        episodeLabel: formatEpisodeLabel(episode.seasonNumber, episode.episodeNumber),
      },
    ];
  });
  const posterMediaId = series.posterMediaId ?? merged.find((e) => e.thumbnailStatus === "ready")?.id ?? null;
  return { ...series, posterMediaId, episodes: merged };
}

export function createSeries(input: { title: string; description?: string | null }) {
  const title = input.title.trim();
  if (!title) throw new Error("Series title cannot be empty.");
  const now = Date.now();
  return getDb()
    .insert(s)
    .values({ title: title.slice(0, 150), description: input.description?.trim() || null, createdAt: now, updatedAt: now })
    .returning()
    .get();
}

export function updateSeries(id: number, input: { title?: string; description?: string | null; posterMediaId?: number | null }) {
  const values: Partial<typeof s.$inferInsert> = { updatedAt: Date.now() };
  if (input.title !== undefined) values.title = input.title.trim().slice(0, 150) || "Untitled";
  if (input.description !== undefined) values.description = input.description?.trim() || null;
  if (input.posterMediaId !== undefined) values.posterMediaId = input.posterMediaId;
  getDb().update(s).set(values).where(eq(s.id, id)).run();
}

export function deleteSeries(id: number): void {
  getDb().delete(s).where(eq(s.id, id)).run();
}

/**
 * Adds videos to a series. Season/episode numbers are detected from filenames when
 * not provided, and the season is re-sorted by episode number afterwards.
 * A video already in another series is moved.
 */
export function addEpisodes(
  seriesId: number,
  entries: Array<{ mediaId: number; seasonNumber?: number | null; episodeNumber?: number | null }>,
): void {
  const db = getDb();
  db.transaction((tx) => {
    const filenames = new Map(
      tx
        .select({ id: schema.media.id, filename: schema.media.filename })
        .from(schema.media)
        .where(inArray(schema.media.id, entries.map((e) => e.mediaId)))
        .all()
        .map((row) => [row.id, row.filename]),
    );
    for (const entry of entries) {
      const filename = filenames.get(entry.mediaId);
      if (!filename) continue;
      const parsed = parseEpisodeFromFilename(filename);
      const seasonNumber = entry.seasonNumber !== undefined ? entry.seasonNumber : parsed.seasonNumber;
      const episodeNumber = entry.episodeNumber !== undefined ? entry.episodeNumber : parsed.episodeNumber;
      tx.insert(se)
        .values({ seriesId, mediaId: entry.mediaId, seasonNumber, episodeNumber, position: Number.MAX_SAFE_INTEGER })
        .onConflictDoUpdate({ target: se.mediaId, set: { seriesId, seasonNumber, episodeNumber } })
        .run();
    }
    tx.update(s).set({ updatedAt: Date.now() }).where(eq(s.id, seriesId)).run();
  });
  normalizePositions(seriesId, true);
}

/** Rewrites positions as 0..n-1. With `byEpisodeNumber`, the order follows episode numbers. */
export function normalizePositions(seriesId: number, byEpisodeNumber: boolean): void {
  const episodes = loadEpisodes(seriesId);
  const order = byEpisodeNumber
    ? positionsByEpisodeNumber(episodes)
    : new Map(sortEpisodes(episodes).map((episode, index) => [episode.mediaId, index]));
  const db = getDb();
  db.transaction((tx) => {
    for (const [mediaId, position] of order) {
      tx.update(se).set({ position }).where(eq(se.mediaId, mediaId)).run();
    }
  });
}

export function updateEpisode(mediaId: number, input: { seasonNumber?: number | null; episodeNumber?: number | null }): void {
  const values: Partial<typeof se.$inferInsert> = {};
  if (input.seasonNumber !== undefined) values.seasonNumber = input.seasonNumber;
  if (input.episodeNumber !== undefined) values.episodeNumber = input.episodeNumber;
  getDb().update(se).set(values).where(eq(se.mediaId, mediaId)).run();
}

export function removeEpisodes(mediaIds: number[]): void {
  if (mediaIds.length) getDb().delete(se).where(inArray(se.mediaId, mediaIds)).run();
}

/** Persists a manual order (drag & drop). */
export function reorderEpisodes(seriesId: number, orderedMediaIds: number[]): void {
  const db = getDb();
  db.transaction((tx) => {
    orderedMediaIds.forEach((mediaId, index) => {
      tx.update(se)
        .set({ position: index })
        .where(and(eq(se.seriesId, seriesId), eq(se.mediaId, mediaId)))
        .run();
    });
  });
}

/** Re-detects season/episode numbers from filenames and re-sorts. */
export function autoNumberEpisodes(seriesId: number): void {
  const rows = getDb()
    .select({ mediaId: se.mediaId, filename: schema.media.filename })
    .from(se)
    .innerJoin(schema.media, eq(schema.media.id, se.mediaId))
    .where(eq(se.seriesId, seriesId))
    .all();
  const db = getDb();
  db.transaction((tx) => {
    for (const row of rows) {
      const parsed = parseEpisodeFromFilename(row.filename);
      tx.update(se)
        .set({ seasonNumber: parsed.seasonNumber, episodeNumber: parsed.episodeNumber })
        .where(eq(se.mediaId, row.mediaId))
        .run();
    }
  });
  normalizePositions(seriesId, true);
}

export function getSeriesNeighbors(mediaId: number) {
  const entry = getDb().select({ seriesId: se.seriesId }).from(se).where(eq(se.mediaId, mediaId)).get();
  if (!entry) return null;
  const series = getDb().select({ id: s.id, title: s.title }).from(s).where(eq(s.id, entry.seriesId)).get();
  if (!series) return null;
  const available = new Set(
    getDb()
      .select({ id: schema.media.id })
      .from(se)
      .innerJoin(schema.media, eq(schema.media.id, se.mediaId))
      .where(and(eq(se.seriesId, entry.seriesId), eq(schema.media.status, "available")))
      .all()
      .map((row) => row.id),
  );
  const episodes = loadEpisodes(entry.seriesId).filter((e) => available.has(e.mediaId) || e.mediaId === mediaId);
  const { previous, next, index } = findAdjacentEpisodes(episodes, mediaId);
  return { series, previous, next, index, total: episodes.length, current: episodes.find((e) => e.mediaId === mediaId) ?? null };
}

/** First unwatched (or in-progress) episode, falling back to the first episode. */
export function getSeriesResumeTarget(seriesId: number): number | null {
  const episodes = sortEpisodes(loadEpisodes(seriesId));
  if (episodes.length === 0) return null;
  const completed = new Set(
    getDb()
      .select({ mediaId: schema.watchHistory.mediaId })
      .from(schema.watchHistory)
      .where(and(inArray(schema.watchHistory.mediaId, episodes.map((e) => e.mediaId)), eq(schema.watchHistory.completed, true)))
      .all()
      .map((row) => row.mediaId),
  );
  return (episodes.find((e) => !completed.has(e.mediaId)) ?? episodes[0])!.mediaId;
}

export function listSeriesOptions() {
  return getDb().select({ id: s.id, title: s.title }).from(s).orderBy(asc(s.title)).all();
}
