import fs from "node:fs/promises";
import path from "node:path";
import { VIDEO_EXTENSIONS } from "@/server/config";

export class MediaPathError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "outside-source" | "unsupported" | "not-found" | "not-a-file" | "permission",
  ) {
    super(message);
    this.name = "MediaPathError";
  }
}

/** Lowercase extension without the leading dot ("" if none). */
export function getExtension(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase();
}

export function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(getExtension(filePath));
}

/**
 * Normalizes a user-provided folder path for use as a media source root.
 * Requires an absolute path; strips trailing separators and "." / ".." segments.
 */
export function normalizeSourcePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("\0")) throw new MediaPathError("Folder path is empty or invalid.", "invalid");
  if (!path.isAbsolute(trimmed)) throw new MediaPathError("Folder path must be absolute (e.g. /mnt/media).", "invalid");
  const normalized = path.resolve(trimmed);
  return normalized.length > 1 && normalized.endsWith(path.sep) ? normalized.slice(0, -1) : normalized;
}

/**
 * True when `candidate` is strictly inside `root` (lexically, after normalization).
 * Rejects the root itself, sibling prefixes (/media/a vs /media/ab) and traversal.
 */
export function isPathInside(root: string, candidate: string): boolean {
  if (!path.isAbsolute(root) || !path.isAbsolute(candidate)) return false;
  if (root.includes("\0") || candidate.includes("\0")) return false;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Validates that a stored media path may be served: it must be absolute, already
 * normalized, inside its source root, and have a supported video extension.
 * Symlinks are resolved and must still point at a regular file.
 */
export async function assertServableMediaPath(sourceRoot: string, absolutePath: string): Promise<{ size: number; mtimeMs: number }> {
  if (!path.isAbsolute(absolutePath) || path.resolve(absolutePath) !== absolutePath) {
    throw new MediaPathError("Media path is not a normalized absolute path.", "invalid");
  }
  if (!isPathInside(sourceRoot, absolutePath)) {
    throw new MediaPathError("Media path is outside of its media source.", "outside-source");
  }
  if (!isVideoFile(absolutePath)) {
    throw new MediaPathError("File type is not a supported video format.", "unsupported");
  }
  try {
    // A symlink inside a media folder may point elsewhere; its target must still be a video file.
    const realPath = await fs.realpath(absolutePath);
    if (!isVideoFile(realPath)) throw new MediaPathError("Symlink target is not a supported video file.", "unsupported");
    const stat = await fs.stat(realPath);
    if (!stat.isFile()) throw new MediaPathError("Media path is not a regular file.", "not-a-file");
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  } catch (error) {
    if (error instanceof MediaPathError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") throw new MediaPathError("Permission denied reading the video file.", "permission");
    throw new MediaPathError("Video file not found on disk.", "not-found");
  }
}
