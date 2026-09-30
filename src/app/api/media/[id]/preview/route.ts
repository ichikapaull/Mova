import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { findPreviewFile } from "@/server/cache";
import { getDb, schema } from "@/server/db";
import { getFfmpegStatus } from "@/server/ffmpeg/detect";
import { jsonError, parseIdParam, serveFile } from "@/server/http-file";
import { getJobQueue } from "@/server/jobs";
import { getSettings } from "@/server/repositories/settings";

/** Serves the cached hover preview (small muted clip). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseIdParam((await params).id);
  if (!id) return jsonError("Invalid media id.", 400);
  const file = await findPreviewFile(id);
  if (!file) return jsonError("Preview not generated yet.", 404);
  const stat = await fs.stat(file);
  return serveFile(request, file, {
    contentType: file.endsWith(".webm") ? "video/webm" : "video/mp4",
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    cacheControl: "private, max-age=86400",
  });
}

/**
 * Asks for a preview. Returns its status and, when missing, queues generation
 * with priority (the user is hovering the card right now).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseIdParam((await params).id);
  if (!id) return jsonError("Invalid media id.", 400);
  const db = getDb();
  const row = db
    .select({ status: schema.media.previewStatus, mediaStatus: schema.media.status })
    .from(schema.media)
    .where(eq(schema.media.id, id))
    .get();
  if (!row || row.mediaStatus !== "available") return jsonError("Video not found.", 404);

  const file = await findPreviewFile(id);
  if (file) {
    if (row.status !== "ready") db.update(schema.media).set({ previewStatus: "ready" }).where(eq(schema.media.id, id)).run();
    return Response.json({ status: "ready" });
  }
  if (row.status === "failed") return Response.json({ status: "failed" });

  const [ffmpeg, settings] = [await getFfmpegStatus(), getSettings()];
  if (!ffmpeg.available || !ffmpeg.previewEncoder || settings.previewGeneration === "off") {
    return Response.json({ status: "unavailable" });
  }
  if (row.status === "ready") db.update(schema.media).set({ previewStatus: "pending" }).where(eq(schema.media.id, id)).run();
  getJobQueue().enqueue("preview", [id], true);
  return Response.json({ status: "pending" });
}
