import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * All timestamps are unix epoch milliseconds stored as INTEGER.
 * Durations are seconds stored as REAL.
 */

export type JobStatus = "pending" | "ready" | "failed";
/** available: on disk. missing: gone since last scan. removed: hidden by the user, never re-added by scans. */
export type MediaStatus = "available" | "missing" | "removed";
export type RelationType = "related" | "continuation";

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    icon: text("icon"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("categories_name_unique").on(sql`lower(${t.name})`)],
);

export const mediaSources = sqliteTable("media_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** Category automatically assigned to newly indexed files from this source. */
  defaultCategoryId: integer("default_category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  /** False when the folder could not be read on the last scan (e.g. unmounted disk). */
  isOnline: integer("is_online", { mode: "boolean" }).notNull().default(true),
  lastScanAt: integer("last_scan_at"),
  lastScanError: text("last_scan_error"),
  createdAt: integer("created_at").notNull(),
});

export const media = sqliteTable(
  "media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => mediaSources.id, { onDelete: "cascade" }),
    absolutePath: text("absolute_path").notNull().unique(),
    relativePath: text("relative_path").notNull(),
    filename: text("filename").notNull(),
    extension: text("extension").notNull(),
    displayTitle: text("display_title").notNull(),
    notes: text("notes"),
    /** Lowercased, diacritic-free title + path used for fast substring search. */
    searchText: text("search_text").notNull(),

    fileSize: integer("file_size").notNull(),
    fileModifiedAt: integer("file_modified_at").notNull(),
    fileCreatedAt: integer("file_created_at"),

    durationSec: real("duration_sec"),
    width: integer("width"),
    height: integer("height"),
    videoCodec: text("video_codec"),
    audioCodec: text("audio_codec"),
    containerFormat: text("container_format"),
    fps: real("fps"),
    bitrate: integer("bitrate"),

    probeStatus: text("probe_status").$type<JobStatus>().notNull().default("pending"),
    probeError: text("probe_error"),
    thumbnailStatus: text("thumbnail_status").$type<JobStatus>().notNull().default("pending"),
    thumbnailError: text("thumbnail_error"),
    previewStatus: text("preview_status").$type<JobStatus>().notNull().default("pending"),
    previewError: text("preview_error"),

    status: text("status").$type<MediaStatus>().notNull().default("available"),
    missingSince: integer("missing_since"),

    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    favoritedAt: integer("favorited_at"),

    /** First time the file was indexed ("date added"). */
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    /** Last time file metadata was (re)read with ffprobe. */
    indexedAt: integer("indexed_at"),
  },
  (t) => [
    index("media_source_idx").on(t.sourceId),
    index("media_status_idx").on(t.status),
    index("media_created_idx").on(t.createdAt),
    index("media_title_idx").on(t.displayTitle),
    index("media_favorite_idx").on(t.isFavorite),
    index("media_size_mtime_idx").on(t.fileSize, t.fileModifiedAt),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("tags_name_unique").on(sql`lower(${t.name})`)],
);

export const mediaTags = sqliteTable(
  "media_tags",
  {
    mediaId: integer("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.tagId] }), index("media_tags_tag_idx").on(t.tagId)],
);

export const mediaCategories = sqliteTable(
  "media_categories",
  {
    mediaId: integer("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.mediaId, t.categoryId] }),
    index("media_categories_category_idx").on(t.categoryId),
  ],
);

export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const collectionItems = sqliteTable(
  "collection_items",
  {
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    mediaId: integer("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: integer("added_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.mediaId] }),
    index("collection_items_media_idx").on(t.mediaId),
  ],
);

export const series = sqliteTable("series", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  /** Episode whose thumbnail is used as the series poster. */
  posterMediaId: integer("poster_media_id").references((): AnySQLiteColumn => media.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const seriesEpisodes = sqliteTable(
  "series_episodes",
  {
    seriesId: integer("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    /** A video belongs to at most one series. */
    mediaId: integer("media_id")
      .notNull()
      .unique()
      .references(() => media.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number"),
    episodeNumber: real("episode_number"),
    /** Playback order inside a season; lower plays first. */
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.mediaId] })],
);

export const mediaRelations = sqliteTable(
  "media_relations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** For "continuation": the earlier video. */
    sourceMediaId: integer("source_media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    /** For "continuation": the video that continues the source. */
    targetMediaId: integer("target_media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    type: text("type").$type<RelationType>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("media_relations_unique").on(t.sourceMediaId, t.targetMediaId, t.type),
    index("media_relations_target_idx").on(t.targetMediaId),
  ],
);

/** One row per video: the latest playback state. */
export const watchHistory = sqliteTable(
  "watch_history",
  {
    mediaId: integer("media_id")
      .primaryKey()
      .references(() => media.id, { onDelete: "cascade" }),
    positionSec: real("position_sec").notNull().default(0),
    durationSec: real("duration_sec"),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    playCount: integer("play_count").notNull().default(0),
    lastWatchedAt: integer("last_watched_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (t) => [index("watch_history_last_watched_idx").on(t.lastWatchedAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type MediaRow = typeof media.$inferSelect;
export type NewMediaRow = typeof media.$inferInsert;
export type MediaSourceRow = typeof mediaSources.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;
export type SeriesRow = typeof series.$inferSelect;
export type SeriesEpisodeRow = typeof seriesEpisodes.$inferSelect;
export type WatchHistoryRow = typeof watchHistory.$inferSelect;
