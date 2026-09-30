import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { listMediaItemsByIds } from "@/server/repositories/library";

const c = schema.collections;
const ci = schema.collectionItems;

export type CollectionSummary = {
  id: number;
  name: string;
  description: string | null;
  count: number;
  coverMediaIds: number[];
  updatedAt: number;
};

export function listCollections(): CollectionSummary[] {
  const rows = getDb()
    .select({
      id: c.id,
      name: c.name,
      description: c.description,
      updatedAt: c.updatedAt,
      count: sql<number>`count(${ci.mediaId})`,
      covers: sql<string | null>`(
        select group_concat(media_id) from (
          select x.media_id from collection_items x join media mm on mm.id = x.media_id
          where x.collection_id = ${c.id} and mm.status = 'available' and mm.thumbnail_status = 'ready'
          order by x.position limit 4
        )
      )`,
    })
    .from(c)
    .leftJoin(ci, eq(ci.collectionId, c.id))
    .groupBy(c.id)
    .orderBy(desc(c.updatedAt))
    .all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    updatedAt: row.updatedAt,
    count: Number(row.count),
    coverMediaIds: row.covers ? row.covers.split(",").map(Number) : [],
  }));
}

export function getCollection(id: number) {
  const collection = getDb().select().from(c).where(eq(c.id, id)).get();
  if (!collection) return null;
  const ids = getDb()
    .select({ mediaId: ci.mediaId })
    .from(ci)
    .where(eq(ci.collectionId, id))
    .orderBy(asc(ci.position), asc(ci.addedAt))
    .all()
    .map((row) => row.mediaId);
  return { ...collection, items: listMediaItemsByIds(ids, { includeUnavailable: true }) };
}

export function getCollectionMediaIds(id: number): number[] {
  return getDb()
    .select({ mediaId: ci.mediaId })
    .from(ci)
    .innerJoin(schema.media, eq(schema.media.id, ci.mediaId))
    .where(and(eq(ci.collectionId, id), eq(schema.media.status, "available")))
    .orderBy(asc(ci.position), asc(ci.addedAt))
    .all()
    .map((row) => row.mediaId);
}

export function createCollection(input: { name: string; description?: string | null }) {
  const name = input.name.trim();
  if (!name) throw new Error("Collection name cannot be empty.");
  const now = Date.now();
  return getDb()
    .insert(c)
    .values({ name: name.slice(0, 100), description: input.description?.trim() || null, createdAt: now, updatedAt: now })
    .returning()
    .get();
}

export function updateCollection(id: number, input: { name?: string; description?: string | null }) {
  const values: Partial<typeof c.$inferInsert> = { updatedAt: Date.now() };
  if (input.name !== undefined) values.name = input.name.trim().slice(0, 100) || "Untitled";
  if (input.description !== undefined) values.description = input.description?.trim() || null;
  getDb().update(c).set(values).where(eq(c.id, id)).run();
}

export function deleteCollection(id: number): void {
  getDb().delete(c).where(eq(c.id, id)).run();
}

/** Appends videos to the end of a collection (already-present ones are skipped). */
export function addToCollection(collectionId: number, mediaIds: number[]): void {
  const db = getDb();
  db.transaction((tx) => {
    const [{ max } = { max: -1 }] = tx
      .select({ max: sql<number>`coalesce(max(${ci.position}), -1)` })
      .from(ci)
      .where(eq(ci.collectionId, collectionId))
      .all();
    let position = Number(max);
    const now = Date.now();
    for (const mediaId of mediaIds) {
      const result = tx
        .insert(ci)
        .values({ collectionId, mediaId, position: position + 1, addedAt: now })
        .onConflictDoNothing()
        .run();
      if (result.changes > 0) position++;
    }
    tx.update(c).set({ updatedAt: now }).where(eq(c.id, collectionId)).run();
  });
}

export function removeFromCollection(collectionId: number, mediaIds: number[]): void {
  getDb()
    .delete(ci)
    .where(and(eq(ci.collectionId, collectionId), inArray(ci.mediaId, mediaIds)))
    .run();
}

/** Persists a user-defined order. Ids not in the collection are ignored. */
export function reorderCollection(collectionId: number, orderedMediaIds: number[]): void {
  const db = getDb();
  db.transaction((tx) => {
    orderedMediaIds.forEach((mediaId, index) => {
      tx.update(ci)
        .set({ position: index })
        .where(and(eq(ci.collectionId, collectionId), eq(ci.mediaId, mediaId)))
        .run();
    });
    tx.update(c).set({ updatedAt: Date.now() }).where(eq(c.id, collectionId)).run();
  });
}
