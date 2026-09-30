import fs from "node:fs/promises";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { directorySize } from "@/server/cache";
import { DATA_DIR, DB_PATH, PREVIEW_DIR, THUMBNAIL_DIR } from "@/server/config";
import { getFfmpegStatus } from "@/server/ffmpeg/detect";
import { getSettings } from "@/server/repositories/settings";
import { countMissing, countRemoved, listSources } from "@/server/repositories/sources";
import { listCategories } from "@/server/repositories/taxonomy";
import { getWatcherStatus } from "@/server/watcher";

export const metadata: Metadata = { title: "Settings" };

async function fileSize(file: string): Promise<number> {
  const [main, wal] = await Promise.all([fs.stat(file).catch(() => null), fs.stat(`${file}-wal`).catch(() => null)]);
  return (main?.size ?? 0) + (wal?.size ?? 0);
}

export default async function SettingsPage() {
  const [ffmpeg, thumbnails, previews, dbBytes] = await Promise.all([
    getFfmpegStatus(),
    directorySize(THUMBNAIL_DIR),
    directorySize(PREVIEW_DIR),
    fileSize(DB_PATH),
  ]);
  return (
    <PageContainer className="max-w-6xl">
      <PageHeader title="Settings" />
      <SettingsView
        settings={getSettings()}
        sources={listSources()}
        categories={listCategories().map(({ id, name }) => ({ id, name }))}
        ffmpeg={ffmpeg}
        storage={{ dataDir: DATA_DIR, dbPath: DB_PATH, dbBytes, thumbnails, previews }}
        counts={{ missing: countMissing(), removed: countRemoved() }}
        watcher={getWatcherStatus()}
      />
    </PageContainer>
  );
}
