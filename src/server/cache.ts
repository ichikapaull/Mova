import fs from "node:fs/promises";
import path from "node:path";
import { PREVIEW_DIR, THUMBNAIL_DIR, TMP_DIR } from "@/server/config";

export function thumbnailFilePath(mediaId: number): string {
  return path.join(/* turbopackIgnore: true */ THUMBNAIL_DIR, `${mediaId}.jpg`);
}

export function previewFilePath(mediaId: number, extension: "mp4" | "webm"): string {
  return path.join(/* turbopackIgnore: true */ PREVIEW_DIR, `${mediaId}.${extension}`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).size > 0;
  } catch {
    return false;
  }
}

export async function findThumbnailFile(mediaId: number): Promise<string | null> {
  const file = thumbnailFilePath(mediaId);
  return (await fileExists(file)) ? file : null;
}

export async function findPreviewFile(mediaId: number): Promise<string | null> {
  for (const ext of ["mp4", "webm"] as const) {
    const file = previewFilePath(mediaId, ext);
    if (await fileExists(file)) return file;
  }
  return null;
}

export async function removeCachedFiles(mediaIds: number[]): Promise<void> {
  await Promise.all(
    mediaIds.flatMap((id) => [
      fs.rm(thumbnailFilePath(id), { force: true }),
      fs.rm(previewFilePath(id, "mp4"), { force: true }),
      fs.rm(previewFilePath(id, "webm"), { force: true }),
    ]),
  );
}

export async function directorySize(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stat = await fs.stat(path.join(dir, entry.name)).catch(() => null);
      if (stat) {
        bytes += stat.size;
        files++;
      }
    }
  } catch {
    // Directory doesn't exist yet.
  }
  return { bytes, files };
}

export async function clearCacheDirectory(kind: "thumbnails" | "previews"): Promise<void> {
  const dir = kind === "thumbnails" ? THUMBNAIL_DIR : PREVIEW_DIR;
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureCacheDirectories(): Promise<void> {
  await Promise.all([THUMBNAIL_DIR, PREVIEW_DIR, TMP_DIR].map((dir) => fs.mkdir(dir, { recursive: true })));
  // Leftovers from interrupted ffmpeg runs.
  const leftovers = await fs.readdir(TMP_DIR).catch(() => []);
  await Promise.all(leftovers.map((name) => fs.rm(path.join(TMP_DIR, name), { force: true })));
}
