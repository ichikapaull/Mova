import { ensureCacheDirectories } from "@/server/cache";
import { getDb } from "@/server/db";
import { getFfmpegStatus } from "@/server/ffmpeg/detect";
import { enqueuePendingJobs } from "@/server/jobs";
import { getSettings } from "@/server/repositories/settings";
import { requestScan } from "@/server/scanner";
import { syncWatchers } from "@/server/watcher";

const globalForStartup = globalThis as unknown as { __movaStarted?: boolean };

/**
 * Boots background work once per server process: migrations (via getDb), cache
 * folders, FFmpeg detection, pending jobs, folder watchers and a catch-up scan.
 */
export async function startBackgroundServices(): Promise<void> {
  if (globalForStartup.__movaStarted) return;
  globalForStartup.__movaStarted = true;
  try {
    getDb();
  } catch (error) {
    console.error("[mova] database unavailable:", error instanceof Error ? error.message : error);
    return;
  }
  await ensureCacheDirectories();
  const ffmpeg = await getFfmpegStatus();
  if (!ffmpeg.available) console.warn(`[mova] ${ffmpeg.error}`);

  enqueuePendingJobs();
  syncWatchers();
  // Pick up changes made while the app was not running.
  if (getSettings().setupCompleted) requestScan();
}
