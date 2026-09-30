import fs from "node:fs/promises";
import path from "node:path";
import { and, between, count, eq, inArray, ne } from "drizzle-orm";
import { titleFromFilename } from "@/lib/episode-parser";
import { buildMediaSearchText } from "@/lib/search";
import { getDb, schema } from "@/server/db";
import { getFfmpegStatus } from "@/server/ffmpeg/detect";
import { type ProbeResult, probeMediaFile } from "@/server/ffmpeg/probe";
import { enqueuePendingJobs, getJobQueue } from "@/server/jobs";
import { getExtension, isVideoFile } from "@/server/media-paths";

export type FoundFile = {
  absolutePath: string;
  size: number;
  mtimeMs: number;
  birthtimeMs: number | null;
};

export type ScanSummary = {
  sourceId: number;
  added: number;
  updated: number;
  relinked: number;
  restored: number;
  missing: number;
  unchanged: number;
  probed: number;
  probeFailed: number;
  walkErrors: string[];
  offline: boolean;
  error: string | null;
  durationMs: number;
};

export type ScanProgress = {
  running: boolean;
  sourceId: number | null;
  sourceName: string | null;
  phase: "idle" | "walking" | "indexing" | "probing";
  found: number;
  processed: number;
  total: number;
  queuedSources: number;
  lastSummary: ScanSummary | null;
  lastFinishedAt: number | null;
};

const MOVE_MTIME_TOLERANCE_MS = 2000;

/** Folder names never descended into. */
const IGNORED_DIRECTORIES = new Set(["lost+found", "$RECYCLE.BIN", "System Volume Information", "@eaDir", "node_modules"]);

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

/**
 * Recursively collects supported video files below `root`.
 * Hidden folders are skipped and directory symlinks are not followed (loop safety).
 * Unreadable subfolders are reported but don't abort the walk.
 */
export async function walkVideoFiles(root: string, onProgress?: (found: number) => void): Promise<{ files: FoundFile[]; errors: string[] }> {
  const files: FoundFile[] = [];
  const errors: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      errors.push(`${dir}: ${(error as NodeJS.ErrnoException).code ?? "unreadable"}`);
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) stack.push(full);
        continue;
      }
      if (!(entry.isFile() || entry.isSymbolicLink()) || !isVideoFile(entry.name)) continue;
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;
        files.push({
          absolutePath: full,
          size: stat.size,
          mtimeMs: Math.floor(stat.mtimeMs),
          birthtimeMs: stat.birthtimeMs > 0 ? Math.floor(stat.birthtimeMs) : null,
        });
        if (files.length % 200 === 0) onProgress?.(files.length);
      } catch (error) {
        errors.push(`${full}: ${(error as NodeJS.ErrnoException).code ?? "unreadable"}`);
      }
    }
  }
  return { files, errors };
}

// ---------------------------------------------------------------------------
// Indexing (pure database work; no media probing)
// ---------------------------------------------------------------------------

function toRelativePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

export type IndexResult = Pick<ScanSummary, "added" | "updated" | "relinked" | "restored" | "missing" | "unchanged"> & {
  /** Media ids whose metadata must be (re)read with ffprobe. */
  toProbe: number[];
};

/**
 * Incrementally reconciles the files found on disk with the database for one source.
 * - unchanged path + size + mtime → untouched
 * - changed size/mtime → metadata, thumbnail and preview are invalidated
 * - vanished → status "missing" (user metadata kept)
 * - new path whose size + mtime match a missing entry → treated as a move/rename,
 *   so tags, history, series etc. follow the file
 * - entries removed by the user stay hidden and are never re-added
 */
export function indexSourceFiles(sourceId: number, root: string, found: FoundFile[], now = Date.now()): IndexResult {
  const db = getDb();
  const m = schema.media;
  const result: IndexResult = { added: 0, updated: 0, relinked: 0, restored: 0, missing: 0, unchanged: 0, toProbe: [] };

  db.transaction((tx) => {
    const source = tx.select().from(schema.mediaSources).where(eq(schema.mediaSources.id, sourceId)).get();
    const existing = tx
      .select({
        id: m.id,
        absolutePath: m.absolutePath,
        fileSize: m.fileSize,
        fileModifiedAt: m.fileModifiedAt,
        status: m.status,
        probeStatus: m.probeStatus,
      })
      .from(m)
      .where(eq(m.sourceId, sourceId))
      .all();
    const byPath = new Map(existing.map((row) => [row.absolutePath, row]));
    const foundPaths = new Set(found.map((f) => f.absolutePath));

    // 1. Mark vanished files as missing first, so moves inside this source can be matched.
    const vanished = existing.filter((row) => !foundPaths.has(row.absolutePath) && row.status === "available");
    for (const chunk of chunked(vanished.map((row) => row.id), 500)) {
      tx.update(m).set({ status: "missing", missingSince: now, updatedAt: now }).where(inArray(m.id, chunk)).run();
    }
    result.missing = vanished.length;

    // 2. Reconcile found files.
    for (const file of found) {
      const row = byPath.get(file.absolutePath);
      if (row) {
        if (row.status === "removed") continue;
        const changed = row.fileSize !== file.size || row.fileModifiedAt !== file.mtimeMs;
        if (changed) {
          tx.update(m)
            .set({
              fileSize: file.size,
              fileModifiedAt: file.mtimeMs,
              status: "available",
              missingSince: null,
              probeStatus: "pending",
              thumbnailStatus: "pending",
              previewStatus: "pending",
              updatedAt: now,
            })
            .where(eq(m.id, row.id))
            .run();
          result.updated++;
          result.toProbe.push(row.id);
        } else {
          if (row.status === "missing") {
            tx.update(m).set({ status: "available", missingSince: null, updatedAt: now }).where(eq(m.id, row.id)).run();
            result.restored++;
          } else {
            result.unchanged++;
          }
          if (row.probeStatus === "pending") result.toProbe.push(row.id);
        }
        continue;
      }

      const filename = path.basename(file.absolutePath);
      const relativePath = toRelativePath(root, file.absolutePath);

      // Moved / renamed file? Same size and (nearly) same mtime as a missing entry — the
      // tolerance covers FAT/exFAT disks that store 2-second timestamps. Prefer same filename.
      const candidates = tx
        .select({ id: m.id, filename: m.filename, displayTitle: m.displayTitle })
        .from(m)
        .where(
          and(
            eq(m.status, "missing"),
            eq(m.fileSize, file.size),
            between(m.fileModifiedAt, file.mtimeMs - MOVE_MTIME_TOLERANCE_MS, file.mtimeMs + MOVE_MTIME_TOLERANCE_MS),
          ),
        )
        .all();
      const candidate = candidates.find((c) => c.filename === filename) ?? (candidates.length === 1 ? candidates[0] : undefined);
      if (candidate) {
        // Keep a user-edited title; otherwise follow the new filename.
        const titleWasDefault = candidate.displayTitle === titleFromFilename(candidate.filename);
        const displayTitle = titleWasDefault ? titleFromFilename(filename) : candidate.displayTitle;
        tx.update(m)
          .set({
            sourceId,
            absolutePath: file.absolutePath,
            relativePath,
            filename,
            extension: getExtension(filename),
            displayTitle,
            searchText: buildMediaSearchText({ title: displayTitle, filename, relativePath }),
            status: "available",
            missingSince: null,
            updatedAt: now,
          })
          .where(eq(m.id, candidate.id))
          .run();
        result.relinked++;
        continue;
      }

      const displayTitle = titleFromFilename(filename);
      const inserted = tx
        .insert(m)
        .values({
          sourceId,
          absolutePath: file.absolutePath,
          relativePath,
          filename,
          extension: getExtension(filename),
          displayTitle,
          searchText: buildMediaSearchText({ title: displayTitle, filename, relativePath }),
          fileSize: file.size,
          fileModifiedAt: file.mtimeMs,
          fileCreatedAt: file.birthtimeMs,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: m.id })
        .get();
      if (source?.defaultCategoryId) {
        tx.insert(schema.mediaCategories)
          .values({ mediaId: inserted.id, categoryId: source.defaultCategoryId })
          .onConflictDoNothing()
          .run();
      }
      result.added++;
      result.toProbe.push(inserted.id);
    }
  });

  return result;
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// ---------------------------------------------------------------------------
// Probing
// ---------------------------------------------------------------------------

export function applyProbeResult(mediaId: number, probe: ProbeResult, now = Date.now()): void {
  getDb()
    .update(schema.media)
    .set({ ...probe, probeStatus: "ready", probeError: null, indexedAt: now, updatedAt: now })
    .where(eq(schema.media.id, mediaId))
    .run();
}

async function probeAll(
  ids: number[],
  probe: (filePath: string) => Promise<ProbeResult>,
  onProgress: (done: number) => void,
): Promise<{ probed: number; failed: number }> {
  const db = getDb();
  let cursor = 0;
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++]!;
      const row = db.select({ absolutePath: schema.media.absolutePath }).from(schema.media).where(eq(schema.media.id, id)).get();
      if (row) {
        try {
          applyProbeResult(id, await probe(row.absolutePath));
        } catch (error) {
          failed++;
          db.update(schema.media)
            .set({
              probeStatus: "failed",
              probeError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
              indexedAt: Date.now(),
            })
            .where(eq(schema.media.id, id))
            .run();
        }
      }
      done++;
      if (done % 5 === 0 || done === ids.length) onProgress(done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
  return { probed: done - failed, failed };
}

// ---------------------------------------------------------------------------
// Full source scan
// ---------------------------------------------------------------------------

export type ScanOptions = {
  /** Injected in tests; defaults to ffprobe. */
  probe?: (filePath: string) => Promise<ProbeResult>;
  /** Queue thumbnail/preview jobs afterwards (default true). */
  enqueueJobs?: boolean;
  onProgress?: (update: Partial<ScanProgress>) => void;
};

function describeFsError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return "Folder not found. If it is on an external disk, make sure the disk is mounted.";
  if (code === "EACCES" || code === "EPERM") return "Permission denied while reading the folder.";
  if (code === "ENOTDIR") return "Path is not a folder.";
  return error instanceof Error ? error.message : String(error);
}

export async function scanSource(sourceId: number, options: ScanOptions = {}): Promise<ScanSummary> {
  const started = Date.now();
  const db = getDb();
  const summary: ScanSummary = {
    sourceId,
    added: 0,
    updated: 0,
    relinked: 0,
    restored: 0,
    missing: 0,
    unchanged: 0,
    probed: 0,
    probeFailed: 0,
    walkErrors: [],
    offline: false,
    error: null,
    durationMs: 0,
  };
  const source = db.select().from(schema.mediaSources).where(eq(schema.mediaSources.id, sourceId)).get();
  if (!source) return { ...summary, error: "Media source not found." };

  const finish = (patch: Partial<typeof schema.mediaSources.$inferInsert>) => {
    db.update(schema.mediaSources)
      .set({ lastScanAt: Date.now(), ...patch })
      .where(eq(schema.mediaSources.id, sourceId))
      .run();
    summary.durationMs = Date.now() - started;
    return summary;
  };

  // Offline detection: never mark a whole library missing because a disk isn't mounted.
  try {
    const stat = await fs.stat(source.path);
    if (!stat.isDirectory()) throw Object.assign(new Error("Not a directory"), { code: "ENOTDIR" });
    await fs.access(source.path, fs.constants.R_OK | fs.constants.X_OK);
  } catch (error) {
    summary.offline = true;
    summary.error = describeFsError(error);
    return finish({ isOnline: false, lastScanError: summary.error });
  }

  options.onProgress?.({ phase: "walking", found: 0 });
  const { files, errors } = await walkVideoFiles(source.path, (found) => options.onProgress?.({ found }));
  summary.walkErrors = errors.slice(0, 20);

  if (files.length === 0) {
    const [known] = db
      .select({ total: count() })
      .from(schema.media)
      .where(and(eq(schema.media.sourceId, sourceId), ne(schema.media.status, "removed")))
      .all();
    const rootEntries = await fs.readdir(source.path).catch(() => []);
    if ((known?.total ?? 0) > 0 && rootEntries.length === 0) {
      summary.offline = true;
      summary.error = "Folder is empty. If it is a mount point, the disk is probably not mounted.";
      return finish({ isOnline: false, lastScanError: summary.error });
    }
  }

  options.onProgress?.({ phase: "indexing", found: files.length });
  const indexed = indexSourceFiles(sourceId, source.path, files);
  Object.assign(summary, {
    added: indexed.added,
    updated: indexed.updated,
    relinked: indexed.relinked,
    restored: indexed.restored,
    missing: indexed.missing,
    unchanged: indexed.unchanged,
  });

  const probe = options.probe ?? ((await getFfmpegStatus()).available ? probeMediaFile : null);
  if (probe && indexed.toProbe.length > 0) {
    options.onProgress?.({ phase: "probing", processed: 0, total: indexed.toProbe.length });
    const result = await probeAll(indexed.toProbe, probe, (processed) => options.onProgress?.({ processed }));
    summary.probed = result.probed;
    summary.probeFailed = result.failed;
  }

  if (options.enqueueJobs !== false) enqueuePendingJobs();

  return finish({
    isOnline: true,
    lastScanError: errors.length ? `${errors.length} item(s) could not be read (first: ${errors[0]})` : null,
  });
}

// ---------------------------------------------------------------------------
// Scan manager (one scan at a time, queued)
// ---------------------------------------------------------------------------

type ScanManagerState = { progress: ScanProgress; queue: number[]; running: Promise<void> | null };

const globalForScan = globalThis as unknown as { __movaScan?: ScanManagerState };

function scanState(): ScanManagerState {
  globalForScan.__movaScan ??= {
    progress: {
      running: false,
      sourceId: null,
      sourceName: null,
      phase: "idle",
      found: 0,
      processed: 0,
      total: 0,
      queuedSources: 0,
      lastSummary: null,
      lastFinishedAt: null,
    },
    queue: [],
    running: null,
  };
  return globalForScan.__movaScan;
}

export function getScanProgress(): ScanProgress {
  const state = scanState();
  return { ...state.progress, queuedSources: state.queue.length };
}

/** Queues scans for the given sources (all enabled sources when omitted). Returns immediately. */
export function requestScan(sourceIds?: number[]): void {
  const state = scanState();
  const ids =
    sourceIds ??
    getDb()
      .select({ id: schema.mediaSources.id })
      .from(schema.mediaSources)
      .where(eq(schema.mediaSources.enabled, true))
      .all()
      .map((row) => row.id);
  for (const id of ids) if (!state.queue.includes(id) && state.progress.sourceId !== id) state.queue.push(id);
  if (!state.running) state.running = drainQueue().finally(() => (state.running = null));
}

export function isScanRunning(): boolean {
  return scanState().progress.running;
}

async function drainQueue(): Promise<void> {
  const state = scanState();
  while (state.queue.length > 0) {
    const sourceId = state.queue.shift()!;
    const source = getDb().select().from(schema.mediaSources).where(eq(schema.mediaSources.id, sourceId)).get();
    if (!source) continue;
    state.progress = {
      ...state.progress,
      running: true,
      sourceId,
      sourceName: source.name,
      phase: "walking",
      found: 0,
      processed: 0,
      total: 0,
    };
    try {
      const summary = await scanSource(sourceId, {
        onProgress: (update) => {
          state.progress = { ...state.progress, ...update };
        },
      });
      state.progress.lastSummary = summary;
    } catch (error) {
      console.error(`[scanner] scan of source ${sourceId} failed:`, error);
      state.progress.lastSummary = {
        sourceId,
        added: 0,
        updated: 0,
        relinked: 0,
        restored: 0,
        missing: 0,
        unchanged: 0,
        probed: 0,
        probeFailed: 0,
        walkErrors: [],
        offline: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: 0,
      };
    }
  }
  state.progress = {
    ...state.progress,
    running: false,
    sourceId: null,
    sourceName: null,
    phase: "idle",
    lastFinishedAt: Date.now(),
  };
}

/** Marks metadata as stale so the next scan re-probes files and regenerates thumbnails. */
export function invalidateMetadata(sourceIds?: number[]): void {
  const db = getDb();
  const where = sourceIds?.length ? inArray(schema.media.sourceId, sourceIds) : undefined;
  db.update(schema.media)
    .set({ probeStatus: "pending", thumbnailStatus: "pending", updatedAt: Date.now() })
    .where(where)
    .run();
  db.update(schema.media)
    .set({ previewStatus: "pending" })
    .where(where ? and(where, eq(schema.media.previewStatus, "failed")) : eq(schema.media.previewStatus, "failed"))
    .run();
  getJobQueue().cancelAll("thumbnail");
}
