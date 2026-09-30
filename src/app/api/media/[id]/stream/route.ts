import { contentTypeFor, jsonError, parseIdParam, serveFile } from "@/server/http-file";
import { assertServableMediaPath, MediaPathError } from "@/server/media-paths";
import { getMediaWithSource } from "@/server/repositories/media";

/**
 * Streams the original video. The file path is looked up by id in the database
 * and re-validated against its media source; no path ever comes from the URL.
 */
async function handle(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseIdParam((await params).id);
  if (!id) return jsonError("Invalid media id.", 400);

  const row = getMediaWithSource(id);
  if (!row || row.media.status === "removed") return jsonError("Video not found in library.", 404);
  if (!row.source.enabled) return jsonError("This media source is disabled.", 403);

  try {
    const stat = await assertServableMediaPath(row.source.path, row.media.absolutePath);
    return serveFile(request, row.media.absolutePath, {
      contentType: contentTypeFor(row.media.extension),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      cacheControl: "private, no-cache",
    });
  } catch (error) {
    if (error instanceof MediaPathError) {
      const status = error.code === "not-found" ? 404 : error.code === "permission" ? 403 : 400;
      const message =
        error.code === "not-found" && !row.source.isOnline
          ? "The media source is offline. Is the disk mounted?"
          : error.message;
      return jsonError(message, status, { code: error.code });
    }
    throw error;
  }
}

export const GET = handle;
export const HEAD = handle;
