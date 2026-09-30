import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { buildMediaSearchText } from "@/lib/search";
import { removeCachedFiles } from "@/server/cache";
import { getDb, schema } from "@/server/db";

const m = schema.media;

export function getMediaRow(id: number) {
  return getDb().select().from(m).where(eq(m.id, id)).get() ?? null;
}

export function getMediaWithSource(id: number) {
  const row = getDb()
    .select({ media: m, source: schema.mediaSources })
    .from(m)
    .innerJoin(schema.mediaSources, eq(schema.mediaSources.id, m.sourceId))
    .where(eq(m.id, id))
    .get();
  return row ?? null;
}

export type MediaDetail = NonNullable<ReturnType<typeof getMediaDetail>>;

export function getMediaDetail(id: number) {
  const db = getDb();
  const row = getMediaWithSource(id);
  if (!row || row.media.status === "removed") return null;

  const tags = db
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.mediaTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.mediaTags.tagId))
    .where(eq(schema.mediaTags.mediaId, id))
    .orderBy(sql`${schema.tags.name} collate nocase`)
    .all();

  const categories = db
    .select({ id: schema.categories.id, name: schema.categories.name, icon: schema.categories.icon })
    .from(schema.mediaCategories)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.mediaCategories.categoryId))
    .where(eq(schema.mediaCategories.mediaId, id))
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name))
    .all();

  const collections = db
    .select({ id: schema.collections.id, name: schema.collections.name })
    .from(schema.collectionItems)
    .innerJoin(schema.collections, eq(schema.collections.id, schema.collectionItems.collectionId))
    .where(eq(schema.collectionItems.mediaId, id))
    .orderBy(asc(schema.collections.name))
    .all();

  const seriesEntry =
    db
      .select({
        seriesId: schema.series.id,
        title: schema.series.title,
        seasonNumber: schema.seriesEpisodes.seasonNumber,
        episodeNumber: schema.seriesEpisodes.episodeNumber,
      })
      .from(schema.seriesEpisodes)
      .innerJoin(schema.series, eq(schema.series.id, schema.seriesEpisodes.seriesId))
      .where(eq(schema.seriesEpisodes.mediaId, id))
      .get() ?? null;

  const history = db.select().from(schema.watchHistory).where(eq(schema.watchHistory.mediaId, id)).get() ?? null;

  return {
    ...row.media,
    source: { id: row.source.id, name: row.source.name, path: row.source.path, isOnline: row.source.isOnline },
    tags,
    categories,
    collections,
    series: seriesEntry,
    history,
  };
}

export function updateMediaMetadata(id: number, patch: { displayTitle?: string; notes?: string | null }): void {
  const row = getMediaRow(id);
  if (!row) return;
  const displayTitle = patch.displayTitle?.trim() || row.displayTitle;
  const notes = patch.notes === undefined ? row.notes : patch.notes?.trim() || null;
  getDb()
    .update(m)
    .set({
      displayTitle,
      notes,
      searchText: buildMediaSearchText({ title: displayTitle, filename: row.filename, relativePath: row.relativePath }),
      updatedAt: Date.now(),
    })
    .where(eq(m.id, id))
    .run();
}

export function setFavorite(ids: number[], favorite: boolean): void {
  if (ids.length === 0) return;
  getDb()
    .update(m)
    .set({ isFavorite: favorite, favoritedAt: favorite ? Date.now() : null })
    .where(inArray(m.id, ids))
    .run();
}

/**
 * Hides videos from the library. Files on disk are NOT deleted, and the entries are
 * kept (status "removed") so future scans don't re-add them.
 */
export async function removeFromLibrary(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  db.transaction((tx) => {
    tx.update(m).set({ status: "removed", updatedAt: Date.now() }).where(inArray(m.id, ids)).run();
    tx.delete(schema.collectionItems).where(inArray(schema.collectionItems.mediaId, ids)).run();
    tx.delete(schema.seriesEpisodes).where(inArray(schema.seriesEpisodes.mediaId, ids)).run();
  });
  await removeCachedFiles(ids);
  db.update(m).set({ thumbnailStatus: "pending", previewStatus: "pending" }).where(inArray(m.id, ids)).run();
}

/** Media rows that are playable right now (available + enabled source). */
export function isMediaPlayable(id: number): boolean {
  const row = getDb()
    .select({ id: m.id })
    .from(m)
    .innerJoin(schema.mediaSources, eq(schema.mediaSources.id, m.sourceId))
    .where(and(eq(m.id, id), eq(m.status, "available"), eq(schema.mediaSources.enabled, true)))
    .get();
  return Boolean(row);
}
