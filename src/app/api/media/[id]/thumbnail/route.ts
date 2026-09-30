import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { findThumbnailFile } from "@/server/cache";
import { getDb, schema } from "@/server/db";
import { jsonError, parseIdParam, serveFile } from "@/server/http-file";
import { getJobQueue } from "@/server/jobs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseIdParam((await params).id);
  if (!id) return jsonError("Invalid media id.", 400);

  const file = await findThumbnailFile(id);
  if (file) {
    const stat = await fs.stat(file);
    return serveFile(request, file, {
      contentType: "image/jpeg",
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      cacheControl: "private, no-cache",
    });
  }

  // Cache was cleared (or never built): queue regeneration, client shows a fallback poster.
  const row = getDb()
    .select({ status: schema.media.thumbnailStatus })
    .from(schema.media)
    .where(eq(schema.media.id, id))
    .get();
  if (row?.status === "ready") {
    getDb().update(schema.media).set({ thumbnailStatus: "pending" }).where(eq(schema.media.id, id)).run();
  }
  if (row && row.status !== "failed") getJobQueue().enqueue("thumbnail", [id], true);
  return jsonError("Thumbnail not available yet.", 404);
}
