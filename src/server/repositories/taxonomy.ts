import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";

const visibleMediaCount = (joinColumn: typeof schema.mediaTags.mediaId | typeof schema.mediaCategories.mediaId) =>
  sql<number>`count(case when exists (
      select 1 from media mm join media_sources ss on ss.id = mm.source_id
      where mm.id = ${joinColumn} and mm.status = 'available' and ss.enabled = 1
    ) then 1 end)`;

export class TaxonomyError extends Error {}

function cleanName(name: string, max = 60): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) throw new TaxonomyError("Name cannot be empty.");
  if (cleaned.length > max) throw new TaxonomyError(`Name must be at most ${max} characters.`);
  return cleaned;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export type TagSummary = { id: number; name: string; count: number };

export function listTags(): TagSummary[] {
  return getDb()
    .select({ id: schema.tags.id, name: schema.tags.name, count: visibleMediaCount(schema.mediaTags.mediaId) })
    .from(schema.tags)
    .leftJoin(schema.mediaTags, eq(schema.mediaTags.tagId, schema.tags.id))
    .groupBy(schema.tags.id)
    .orderBy(sql`${schema.tags.name} collate nocase`)
    .all()
    .map((row) => ({ ...row, count: Number(row.count) }));
}

export function getTag(id: number) {
  return getDb().select().from(schema.tags).where(eq(schema.tags.id, id)).get() ?? null;
}

export function findOrCreateTag(name: string): { id: number; name: string } {
  const cleaned = cleanName(name, 40);
  const db = getDb();
  const existing = db
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(sql`lower(${schema.tags.name}) = lower(${cleaned})`)
    .get();
  if (existing) return existing;
  return db
    .insert(schema.tags)
    .values({ name: cleaned, createdAt: Date.now() })
    .returning({ id: schema.tags.id, name: schema.tags.name })
    .get();
}

export function addTagsToMedia(mediaIds: number[], tagNames: string[]): Array<{ id: number; name: string }> {
  const db = getDb();
  return db.transaction(() => {
    const tags = tagNames.map(findOrCreateTag);
    for (const tag of tags) {
      for (const mediaId of mediaIds) {
        db.insert(schema.mediaTags).values({ mediaId, tagId: tag.id }).onConflictDoNothing().run();
      }
    }
    return tags;
  });
}

export function removeTagFromMedia(mediaIds: number[], tagId: number): void {
  getDb()
    .delete(schema.mediaTags)
    .where(and(inArray(schema.mediaTags.mediaId, mediaIds), eq(schema.mediaTags.tagId, tagId)))
    .run();
}

export function renameTag(id: number, name: string): void {
  const cleaned = cleanName(name, 40);
  const db = getDb();
  const clash = db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(sql`lower(${schema.tags.name}) = lower(${cleaned}) and ${schema.tags.id} != ${id}`)
    .get();
  if (clash) {
    // Merge into the existing tag.
    db.transaction((tx) => {
      tx.run(sql`insert or ignore into media_tags (media_id, tag_id) select media_id, ${clash.id} from media_tags where tag_id = ${id}`);
      tx.delete(schema.tags).where(eq(schema.tags.id, id)).run();
    });
    return;
  }
  db.update(schema.tags).set({ name: cleaned }).where(eq(schema.tags.id, id)).run();
}

export function deleteTag(id: number): void {
  getDb().delete(schema.tags).where(eq(schema.tags.id, id)).run();
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type CategorySummary = {
  id: number;
  name: string;
  icon: string | null;
  description: string | null;
  sortOrder: number;
  count: number;
};

export function listCategories(): CategorySummary[] {
  const c = schema.categories;
  return getDb()
    .select({
      id: c.id,
      name: c.name,
      icon: c.icon,
      description: c.description,
      sortOrder: c.sortOrder,
      count: visibleMediaCount(schema.mediaCategories.mediaId),
    })
    .from(c)
    .leftJoin(schema.mediaCategories, eq(schema.mediaCategories.categoryId, c.id))
    .groupBy(c.id)
    .orderBy(asc(c.sortOrder), sql`${c.name} collate nocase`)
    .all()
    .map((row) => ({ ...row, count: Number(row.count) }));
}

export function getCategory(id: number) {
  return getDb().select().from(schema.categories).where(eq(schema.categories.id, id)).get() ?? null;
}

export function createCategory(input: { name: string; icon?: string | null; description?: string | null }) {
  const name = cleanName(input.name);
  const db = getDb();
  const clash = db.select().from(schema.categories).where(sql`lower(${schema.categories.name}) = lower(${name})`).get();
  if (clash) return clash;
  const [{ max } = { max: 0 }] = db.select({ max: sql<number>`coalesce(max(${schema.categories.sortOrder}), 0)` }).from(schema.categories).all();
  return db
    .insert(schema.categories)
    .values({
      name,
      icon: input.icon || null,
      description: input.description?.trim() || null,
      sortOrder: Number(max) + 1,
      createdAt: Date.now(),
    })
    .returning()
    .get();
}

export function updateCategory(id: number, input: { name?: string; icon?: string | null; description?: string | null }) {
  const values: Partial<typeof schema.categories.$inferInsert> = {};
  if (input.name !== undefined) {
    values.name = cleanName(input.name);
    const clash = getDb()
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(sql`lower(${schema.categories.name}) = lower(${values.name}) and ${schema.categories.id} != ${id}`)
      .get();
    if (clash) throw new TaxonomyError("A category with this name already exists.");
  }
  if (input.icon !== undefined) values.icon = input.icon || null;
  if (input.description !== undefined) values.description = input.description?.trim() || null;
  getDb().update(schema.categories).set(values).where(eq(schema.categories.id, id)).run();
}

export function deleteCategory(id: number): void {
  getDb().delete(schema.categories).where(eq(schema.categories.id, id)).run();
}

export function reorderCategories(orderedIds: number[]): void {
  const db = getDb();
  db.transaction((tx) => {
    orderedIds.forEach((id, index) => {
      tx.update(schema.categories).set({ sortOrder: index }).where(eq(schema.categories.id, id)).run();
    });
  });
}

export function addCategoryToMedia(mediaIds: number[], categoryId: number): void {
  const db = getDb();
  db.transaction((tx) => {
    for (const mediaId of mediaIds) {
      tx.insert(schema.mediaCategories).values({ mediaId, categoryId }).onConflictDoNothing().run();
    }
  });
}

export function removeCategoryFromMedia(mediaIds: number[], categoryId: number): void {
  getDb()
    .delete(schema.mediaCategories)
    .where(and(inArray(schema.mediaCategories.mediaId, mediaIds), eq(schema.mediaCategories.categoryId, categoryId)))
    .run();
}

export const DEFAULT_CATEGORIES: Array<{ name: string; icon: string }> = [
  { name: "Anime", icon: "sparkles" },
  { name: "Movies", icon: "clapperboard" },
  { name: "Series", icon: "tv" },
  { name: "Clips", icon: "scissors" },
  { name: "Music", icon: "music" },
  { name: "Documentary", icon: "book-open" },
];

export function seedDefaultCategories(): void {
  const [row] = getDb().select({ total: count() }).from(schema.categories).all();
  if ((row?.total ?? 0) > 0) return;
  for (const category of DEFAULT_CATEGORIES) createCategory(category);
}
