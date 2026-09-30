"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { settingsUpdateSchema } from "@/lib/settings";
import { clearCacheDirectory } from "@/server/cache";
import { getDb, schema } from "@/server/db";
import { getFfmpegStatus } from "@/server/ffmpeg/detect";
import { enqueuePendingJobs, getJobQueue } from "@/server/jobs";
import { addSource, cleanupMissingMedia, removeSource, restoreRemovedMedia, updateSource } from "@/server/repositories/sources";
import { getSettings, updateSettings } from "@/server/repositories/settings";
import { seedDefaultCategories } from "@/server/repositories/taxonomy";
import { invalidateMetadata, requestScan } from "@/server/scanner";
import { syncWatchers } from "@/server/watcher";
import { runAction } from "./run-action";
import { idSchema } from "./validators";

export async function addSourceAction(input: { path: string; name?: string; defaultCategoryId?: number | null; scan?: boolean }) {
  return runAction(async () => {
    const parsed = z
      .object({
        path: z.string().min(1).max(4096),
        name: z.string().max(100).optional(),
        defaultCategoryId: idSchema.nullable().optional(),
        scan: z.boolean().optional(),
      })
      .parse(input);
    const source = await addSource(parsed);
    syncWatchers();
    if (parsed.scan !== false) requestScan([source.id]);
    return source;
  });
}

export async function updateSourceAction(sourceId: number, patch: { name?: string; enabled?: boolean; defaultCategoryId?: number | null }) {
  return runAction(() => {
    updateSource(
      idSchema.parse(sourceId),
      z
        .object({ name: z.string().max(100).optional(), enabled: z.boolean().optional(), defaultCategoryId: idSchema.nullable().optional() })
        .parse(patch),
    );
    syncWatchers();
  });
}

/** Removes the folder and its library entries. Video files are not touched. */
export async function removeSourceAction(sourceId: number) {
  return runAction(async () => {
    await removeSource(idSchema.parse(sourceId));
    syncWatchers();
  });
}

export async function scanSourcesAction(sourceIds?: number[]) {
  return runAction(() => requestScan(sourceIds ? z.array(idSchema).parse(sourceIds) : undefined), { revalidate: false });
}

export async function rescanMetadataAction(sourceIds?: number[]) {
  return runAction(() => {
    const ids = sourceIds ? z.array(idSchema).parse(sourceIds) : undefined;
    invalidateMetadata(ids);
    requestScan(ids);
  });
}

export async function cleanupMissingAction() {
  return runAction(() => cleanupMissingMedia());
}

export async function restoreRemovedAction() {
  return runAction(() => {
    const count = restoreRemovedMedia();
    requestScan();
    return count;
  });
}

export async function updateSettingsAction(update: Record<string, unknown>) {
  return runAction(() => {
    const before = getSettings();
    const settings = updateSettings(settingsUpdateSchema.parse(update));
    if (before.watchFolders !== settings.watchFolders) syncWatchers();
    if (before.previewGeneration !== settings.previewGeneration) {
      if (settings.previewGeneration === "background") enqueuePendingJobs();
      else getJobQueue().cancelAll("preview");
    }
    return settings;
  });
}

export async function clearCacheAction(kind: "thumbnails" | "previews") {
  return runAction(async () => {
    const parsed = z.enum(["thumbnails", "previews"]).parse(kind);
    getJobQueue().cancelAll(parsed === "thumbnails" ? "thumbnail" : "preview");
    await clearCacheDirectory(parsed);
    const db = getDb();
    if (parsed === "thumbnails") db.update(schema.media).set({ thumbnailStatus: "pending", thumbnailError: null }).run();
    else db.update(schema.media).set({ previewStatus: "pending", previewError: null }).run();
    enqueuePendingJobs();
  });
}

/** Regenerates thumbnails (e.g. after changing the thumbnail position). */
export async function regenerateThumbnailsAction() {
  return runAction(() => {
    getDb().update(schema.media).set({ thumbnailStatus: "pending", thumbnailError: null }).run();
    enqueuePendingJobs();
  });
}

/** Queues previews for every video that doesn't have one yet (failed ones are retried). */
export async function generateAllPreviewsAction() {
  return runAction(() => {
    const db = getDb();
    db.update(schema.media).set({ previewStatus: "pending", previewError: null }).where(eq(schema.media.previewStatus, "failed")).run();
    const ids = db
      .select({ id: schema.media.id })
      .from(schema.media)
      .where(and(eq(schema.media.previewStatus, "pending"), eq(schema.media.status, "available")))
      .all()
      .map((r) => r.id);
    getJobQueue().enqueue("preview", ids);
    return ids.length;
  });
}

export async function recheckFfmpegAction() {
  return runAction(async () => {
    const status = await getFfmpegStatus(true);
    if (status.available) enqueuePendingJobs();
    return status;
  });
}

export async function completeSetupAction(options: { seedCategories?: boolean } = {}) {
  return runAction(() => {
    if (options.seedCategories) seedDefaultCategories();
    updateSettings({ setupCompleted: true });
  });
}

export async function seedDefaultCategoriesAction() {
  return runAction(() => seedDefaultCategories());
}
