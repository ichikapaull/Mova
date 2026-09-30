import { and, eq, inArray } from "drizzle-orm";
import { findPreviewFile, previewFilePath, thumbnailFilePath } from "@/server/cache";
import { getDb, schema } from "@/server/db";
import { getFfmpegStatus } from "@/server/ffmpeg/detect";
import { generatePreview, generateThumbnail, previewFileExtension } from "@/server/ffmpeg/generate";
import { assertServableMediaPath } from "@/server/media-paths";
import { getSettings } from "@/server/repositories/settings";

export type JobKind = "thumbnail" | "preview";

type Lane = {
  concurrency: number;
  /** Slots only priority (user-requested) jobs may use. */
  reservedForPriority: number;
  high: number[];
  normal: number[];
  queued: Set<number>;
  running: Set<number>;
};

export type JobActivity = {
  thumbnails: { queued: number; running: number };
  previews: { queued: number; running: number };
  /** Increments whenever a job finishes; clients refresh when it changes. */
  completedCount: number;
};

class MediaJobQueue {
  private lanes: Record<JobKind, Lane> = {
    thumbnail: { concurrency: 2, reservedForPriority: 0, high: [], normal: [], queued: new Set(), running: new Set() },
    preview: { concurrency: 2, reservedForPriority: 1, high: [], normal: [], queued: new Set(), running: new Set() },
  };
  private completedCount = 0;

  enqueue(kind: JobKind, mediaIds: number[], priority = false): void {
    const lane = this.lanes[kind];
    for (const id of mediaIds) {
      if (lane.running.has(id)) continue;
      if (lane.queued.has(id)) {
        if (priority && !lane.high.includes(id)) {
          lane.normal = lane.normal.filter((queuedId) => queuedId !== id);
          lane.high.unshift(id);
        }
        continue;
      }
      lane.queued.add(id);
      if (priority) lane.high.unshift(id);
      else lane.normal.push(id);
    }
    this.pump(kind);
  }

  isBusy(kind: JobKind, mediaId: number): boolean {
    const lane = this.lanes[kind];
    return lane.queued.has(mediaId) || lane.running.has(mediaId);
  }

  cancelAll(kind: JobKind): void {
    const lane = this.lanes[kind];
    lane.high = [];
    lane.normal = [];
    lane.queued.clear();
  }

  activity(): JobActivity {
    const summarize = (lane: Lane) => ({ queued: lane.queued.size, running: lane.running.size });
    return {
      thumbnails: summarize(this.lanes.thumbnail),
      previews: summarize(this.lanes.preview),
      completedCount: this.completedCount,
    };
  }

  private pump(kind: JobKind): void {
    const lane = this.lanes[kind];
    while (lane.running.size < lane.concurrency) {
      const backgroundAllowed = lane.running.size < lane.concurrency - lane.reservedForPriority;
      const id = lane.high.shift() ?? (backgroundAllowed ? lane.normal.shift() : undefined);
      if (id === undefined) return;
      lane.queued.delete(id);
      lane.running.add(id);
      const task = kind === "thumbnail" ? processThumbnail(id) : processPreview(id);
      task
        .catch((error: unknown) => console.error(`[jobs] ${kind} ${id} crashed:`, error))
        .finally(() => {
          lane.running.delete(id);
          this.completedCount++;
          this.pump(kind);
        });
    }
  }
}

const globalForJobs = globalThis as unknown as { __movaJobs?: MediaJobQueue };

export function getJobQueue(): MediaJobQueue {
  globalForJobs.__movaJobs ??= new MediaJobQueue();
  return globalForJobs.__movaJobs;
}

function loadJobTarget(mediaId: number) {
  const [row] = getDb()
    .select({ media: schema.media, sourcePath: schema.mediaSources.path, sourceEnabled: schema.mediaSources.enabled })
    .from(schema.media)
    .innerJoin(schema.mediaSources, eq(schema.mediaSources.id, schema.media.sourceId))
    .where(eq(schema.media.id, mediaId))
    .all();
  if (!row || row.media.status !== "available" || !row.sourceEnabled) return null;
  return row;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

async function processThumbnail(mediaId: number): Promise<void> {
  const ffmpeg = await getFfmpegStatus();
  if (!ffmpeg.available) return; // stays pending until FFmpeg is installed
  const target = loadJobTarget(mediaId);
  if (!target) return;
  const db = getDb();
  try {
    await assertServableMediaPath(target.sourcePath, target.media.absolutePath);
    const { thumbnailPosition } = getSettings();
    await generateThumbnail(target.media.absolutePath, thumbnailFilePath(mediaId), target.media.durationSec, thumbnailPosition);
    db.update(schema.media)
      .set({ thumbnailStatus: "ready", thumbnailError: null })
      .where(eq(schema.media.id, mediaId))
      .run();
  } catch (error) {
    db.update(schema.media)
      .set({ thumbnailStatus: "failed", thumbnailError: errorMessage(error) })
      .where(eq(schema.media.id, mediaId))
      .run();
  }
}

async function processPreview(mediaId: number): Promise<void> {
  const ffmpeg = await getFfmpegStatus();
  if (!ffmpeg.available || !ffmpeg.previewEncoder) return;
  const target = loadJobTarget(mediaId);
  if (!target) return;
  const db = getDb();
  if (target.media.previewStatus === "ready" && (await findPreviewFile(mediaId))) return;
  try {
    await assertServableMediaPath(target.sourcePath, target.media.absolutePath);
    const settings = getSettings();
    const output = previewFilePath(mediaId, previewFileExtension(ffmpeg.previewEncoder));
    await generatePreview(target.media.absolutePath, output, {
      durationSec: target.media.durationSec,
      lengthSec: settings.previewLengthSec,
      height: settings.previewHeight,
      encoder: ffmpeg.previewEncoder,
    });
    db.update(schema.media)
      .set({ previewStatus: "ready", previewError: null })
      .where(eq(schema.media.id, mediaId))
      .run();
  } catch (error) {
    db.update(schema.media)
      .set({ previewStatus: "failed", previewError: errorMessage(error) })
      .where(eq(schema.media.id, mediaId))
      .run();
  }
}

/** Queues thumbnails (and background previews) that are still pending, e.g. after a restart. */
export function enqueuePendingJobs(): void {
  const db = getDb();
  const visible = and(
    eq(schema.media.status, "available"),
    eq(schema.mediaSources.enabled, true),
    eq(schema.mediaSources.isOnline, true),
  );
  const pendingThumbnails = db
    .select({ id: schema.media.id })
    .from(schema.media)
    .innerJoin(schema.mediaSources, eq(schema.mediaSources.id, schema.media.sourceId))
    .where(and(visible, eq(schema.media.thumbnailStatus, "pending"), inArray(schema.media.probeStatus, ["ready", "failed"])))
    .all()
    .map((r) => r.id);
  getJobQueue().enqueue("thumbnail", pendingThumbnails);

  if (getSettings().previewGeneration === "background") {
    const pendingPreviews = db
      .select({ id: schema.media.id })
      .from(schema.media)
      .innerJoin(schema.mediaSources, eq(schema.mediaSources.id, schema.media.sourceId))
      .where(and(visible, eq(schema.media.previewStatus, "pending"), eq(schema.media.probeStatus, "ready")))
      .all()
      .map((r) => r.id);
    getJobQueue().enqueue("preview", pendingPreviews);
  }
}
