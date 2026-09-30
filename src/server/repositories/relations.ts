import { and, eq, or } from "drizzle-orm";
import type { MediaListItem } from "@/lib/library-query";
import { getDb, schema } from "@/server/db";
import type { RelationType } from "@/server/db/schema";
import { listMediaItemsByIds } from "@/server/repositories/library";

const r = schema.mediaRelations;

export type MediaRelations = {
  /** Videos this one continues (it comes after them). */
  continues: Array<MediaListItem & { relationId: number }>;
  /** Videos that continue this one. */
  continuedBy: Array<MediaListItem & { relationId: number }>;
  related: Array<MediaListItem & { relationId: number }>;
};

export function getRelations(mediaId: number): MediaRelations {
  const rows = getDb()
    .select()
    .from(r)
    .where(or(eq(r.sourceMediaId, mediaId), eq(r.targetMediaId, mediaId)))
    .all();
  const otherIds = rows.map((row) => (row.sourceMediaId === mediaId ? row.targetMediaId : row.sourceMediaId));
  const items = new Map(listMediaItemsByIds(otherIds).map((item) => [item.id, item]));
  const result: MediaRelations = { continues: [], continuedBy: [], related: [] };
  for (const row of rows) {
    const otherId = row.sourceMediaId === mediaId ? row.targetMediaId : row.sourceMediaId;
    const item = items.get(otherId);
    if (!item) continue;
    const entry = { ...item, relationId: row.id };
    if (row.type === "related") result.related.push(entry);
    else if (row.targetMediaId === mediaId) result.continues.push(entry);
    else result.continuedBy.push(entry);
  }
  return result;
}

/**
 * Links two videos. For "continuation", `targetMediaId` continues `sourceMediaId`.
 * "related" is symmetric and stored once.
 */
export function addRelation(sourceMediaId: number, targetMediaId: number, type: RelationType): void {
  if (sourceMediaId === targetMediaId) throw new Error("A video cannot be related to itself.");
  const db = getDb();
  if (type === "related") {
    const existing = db
      .select({ id: r.id })
      .from(r)
      .where(
        and(
          eq(r.type, "related"),
          or(
            and(eq(r.sourceMediaId, sourceMediaId), eq(r.targetMediaId, targetMediaId)),
            and(eq(r.sourceMediaId, targetMediaId), eq(r.targetMediaId, sourceMediaId)),
          ),
        ),
      )
      .get();
    if (existing) return;
  }
  db.insert(r).values({ sourceMediaId, targetMediaId, type, createdAt: Date.now() }).onConflictDoNothing().run();
}

export function removeRelation(relationId: number): void {
  getDb().delete(r).where(eq(r.id, relationId)).run();
}

/** Next/previous video via continuation links (first match). */
export function getContinuationNeighbors(mediaId: number): { previous: number | null; next: number | null } {
  const rows = getDb()
    .select()
    .from(r)
    .where(and(eq(r.type, "continuation"), or(eq(r.sourceMediaId, mediaId), eq(r.targetMediaId, mediaId))))
    .all();
  return {
    previous: rows.find((row) => row.targetMediaId === mediaId)?.sourceMediaId ?? null,
    next: rows.find((row) => row.sourceMediaId === mediaId)?.targetMediaId ?? null,
  };
}
