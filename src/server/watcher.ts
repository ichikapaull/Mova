import fs from "node:fs";
import { getDb, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { isVideoFile } from "@/server/media-paths";
import { getSettings } from "@/server/repositories/settings";
import { requestScan } from "@/server/scanner";

type WatcherState = {
  watchers: Map<number, fs.FSWatcher>;
  timers: Map<number, NodeJS.Timeout>;
  failed: Map<number, string>;
};

const globalForWatcher = globalThis as unknown as { __movaWatcher?: WatcherState };

function state(): WatcherState {
  globalForWatcher.__movaWatcher ??= { watchers: new Map(), timers: new Map(), failed: new Map() };
  return globalForWatcher.__movaWatcher;
}

const DEBOUNCE_MS = 4000;

function scheduleScan(sourceId: number): void {
  const { timers } = state();
  clearTimeout(timers.get(sourceId));
  timers.set(
    sourceId,
    setTimeout(() => {
      timers.delete(sourceId);
      requestScan([sourceId]);
    }, DEBOUNCE_MS),
  );
}

/**
 * (Re)starts recursive filesystem watchers for enabled sources. Watching is a
 * convenience: any failure (inotify limits, network mounts) is recorded and the
 * manual/periodic scan remains the reliable path.
 */
export function syncWatchers(): void {
  const s = state();
  const enabled = getSettings().watchFolders;
  const sources = enabled
    ? getDb().select().from(schema.mediaSources).where(eq(schema.mediaSources.enabled, true)).all()
    : [];
  const wanted = new Map(sources.map((source) => [source.id, source.path]));

  for (const [id, watcher] of s.watchers) {
    if (!wanted.has(id)) {
      watcher.close();
      s.watchers.delete(id);
    }
  }
  for (const id of s.failed.keys()) if (!wanted.has(id)) s.failed.delete(id);

  for (const [id, root] of wanted) {
    if (s.watchers.has(id)) continue;
    try {
      const watcher = fs.watch(root, { recursive: true, persistent: false }, (_event, filename) => {
        // Directory events (no extension) may hide new files inside; video files trigger directly.
        if (!filename || isVideoFile(filename.toString()) || !/\.[a-z0-9]{1,5}$/i.test(filename.toString())) {
          scheduleScan(id);
        }
      });
      watcher.on("error", (error) => {
        s.failed.set(id, error.message);
        watcher.close();
        s.watchers.delete(id);
      });
      s.watchers.set(id, watcher);
      s.failed.delete(id);
    } catch (error) {
      s.failed.set(id, error instanceof Error ? error.message : String(error));
    }
  }
}

export function getWatcherStatus(): { watching: number[]; failed: Array<{ sourceId: number; error: string }> } {
  const s = state();
  return {
    watching: [...s.watchers.keys()],
    failed: [...s.failed.entries()].map(([sourceId, error]) => ({ sourceId, error })),
  };
}
