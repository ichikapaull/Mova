import fs from "node:fs/promises";
import path from "node:path";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { removeCachedFiles } from "@/server/cache";
import { getDb, schema } from "@/server/db";
import { isPathInside, MediaPathError, normalizeSourcePath } from "@/server/media-paths";

export type MediaSourceSummary = typeof schema.mediaSources.$inferSelect & {
  videoCount: number;
  missingCount: number;
  defaultCategoryName: string | null;
};

export function listSources(): MediaSourceSummary[] {
  const s = schema.mediaSources;
  const m = schema.media;
  return getDb()
    .select({
      source: s,
      videoCount: sql<number>`coalesce(sum(case when ${m.status} = 'available' then 1 else 0 end), 0)`,
      missingCount: sql<number>`coalesce(sum(case when ${m.status} = 'missing' then 1 else 0 end), 0)`,
      defaultCategoryName: schema.categories.name,
    })
    .from(s)
    .leftJoin(m, eq(m.sourceId, s.id))
    .leftJoin(schema.categories, eq(schema.categories.id, s.defaultCategoryId))
    .groupBy(s.id)
    .orderBy(s.name)
    .all()
    .map((row) => ({
      ...row.source,
      videoCount: Number(row.videoCount),
      missingCount: Number(row.missingCount),
      defaultCategoryName: row.defaultCategoryName,
    }));
}

export function getSource(id: number) {
  return getDb().select().from(schema.mediaSources).where(eq(schema.mediaSources.id, id)).get() ?? null;
}

/**
 * Registers a folder as a media source. The folder must exist and be readable,
 * and may not overlap with an existing source (nested roots would index files twice).
 */
export async function addSource(input: { path: string; name?: string; defaultCategoryId?: number | null }) {
  const folder = normalizeSourcePath(input.path);
  try {
    const stat = await fs.stat(folder);
    if (!stat.isDirectory()) throw new MediaPathError("That path is a file, not a folder.", "invalid");
    await fs.access(folder, fs.constants.R_OK | fs.constants.X_OK);
  } catch (error) {
    if (error instanceof MediaPathError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") throw new MediaPathError("Permission denied reading that folder.", "permission");
    throw new MediaPathError("Folder does not exist.", "not-found");
  }

  const db = getDb();
  for (const existing of db.select().from(schema.mediaSources).all()) {
    if (existing.path === folder) throw new MediaPathError("This folder is already in your library.", "invalid");
    if (isPathInside(existing.path, folder)) {
      throw new MediaPathError(`This folder is already covered by "${existing.name}".`, "invalid");
    }
    if (isPathInside(folder, existing.path)) {
      throw new MediaPathError(`This folder contains an existing source ("${existing.name}"). Remove that one first.`, "invalid");
    }
  }

  const name = input.name?.trim() || path.basename(folder) || folder;
  return db
    .insert(schema.mediaSources)
    .values({ name, path: folder, defaultCategoryId: input.defaultCategoryId ?? null, createdAt: Date.now() })
    .returning()
    .get();
}

export function updateSource(id: number, patch: { name?: string; enabled?: boolean; defaultCategoryId?: number | null }) {
  const values: Partial<typeof schema.mediaSources.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name.trim() || "Untitled";
  if (patch.enabled !== undefined) values.enabled = patch.enabled;
  if (patch.defaultCategoryId !== undefined) values.defaultCategoryId = patch.defaultCategoryId;
  if (Object.keys(values).length === 0) return;
  getDb().update(schema.mediaSources).set(values).where(eq(schema.mediaSources.id, id)).run();
}

/**
 * Removes a source and its library entries (tags, history, …) from the database.
 * Video files on disk are never touched.
 */
export async function removeSource(id: number): Promise<void> {
  const db = getDb();
  const ids = db
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(eq(schema.media.sourceId, id))
    .all()
    .map((row) => row.id);
  db.delete(schema.mediaSources).where(eq(schema.mediaSources.id, id)).run();
  await removeCachedFiles(ids);
}

export function countSources(): number {
  const [row] = getDb().select({ total: count() }).from(schema.mediaSources).all();
  return row?.total ?? 0;
}

export function countMissing(): number {
  const [row] = getDb().select({ total: count() }).from(schema.media).where(eq(schema.media.status, "missing")).all();
  return row?.total ?? 0;
}

export function countRemoved(): number {
  const [row] = getDb().select({ total: count() }).from(schema.media).where(eq(schema.media.status, "removed")).all();
  return row?.total ?? 0;
}

/** Deletes database entries for files that are gone from disk (only from online sources). */
export async function cleanupMissingMedia(): Promise<number> {
  const db = getDb();
  const rows = db
    .select({ id: schema.media.id })
    .from(schema.media)
    .innerJoin(schema.mediaSources, eq(schema.mediaSources.id, schema.media.sourceId))
    .where(and(eq(schema.media.status, "missing"), eq(schema.mediaSources.isOnline, true)))
    .all();
  const ids = rows.map((row) => row.id);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    db.delete(schema.media).where(inArray(schema.media.id, chunk)).run();
  }
  await removeCachedFiles(ids);
  return ids.length;
}

export function restoreRemovedMedia(): number {
  const result = getDb()
    .update(schema.media)
    .set({ status: "missing", updatedAt: Date.now() })
    .where(eq(schema.media.status, "removed"))
    .run();
  return result.changes;
}

export function listEnabledOnlineSources() {
  return getDb()
    .select()
    .from(schema.mediaSources)
    .where(and(eq(schema.mediaSources.enabled, true), ne(schema.mediaSources.isOnline, false)))
    .all();
}
