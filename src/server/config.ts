import path from "node:path";

/**
 * Filesystem locations owned by Mova. Everything the app writes lives under
 * DATA_DIR; media folders are only ever read.
 */
// `turbopackIgnore` keeps the build from tracing (and bundling) the runtime data folder.
export const DATA_DIR = path.resolve(
  /* turbopackIgnore: true */ process.env.MOVA_DATA_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), "data"),
);
export const DB_PATH = path.join(DATA_DIR, "app.db");
export const CACHE_DIR = path.join(DATA_DIR, "cache");
export const THUMBNAIL_DIR = path.join(CACHE_DIR, "thumbnails");
export const PREVIEW_DIR = path.join(CACHE_DIR, "previews");
export const TMP_DIR = path.join(CACHE_DIR, "tmp");
export const MIGRATIONS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle");

/** Extensions (lowercase, without dot) that are indexed as videos. */
export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  "mp4",
  "mkv",
  "webm",
  "mov",
  "avi",
  "m4v",
  "wmv",
  "flv",
  "mpg",
  "mpeg",
  "ts",
  "m2ts",
  "ogv",
  "3gp",
]);
