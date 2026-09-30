import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type AppDatabase, createDatabase, setDbForTesting } from "@/server/db";
import { schema } from "@/server/db";

/** Fresh in-memory database with all migrations applied, installed as the process DB. */
export function setupTestDatabase(): AppDatabase {
  const db = createDatabase(":memory:", path.resolve(import.meta.dirname, "../drizzle"));
  setDbForTesting(db);
  return db;
}

export function makeTempDir(prefix = "mova-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Writes a small fake "video" file (content doesn't matter for indexing tests). */
export function writeFakeVideo(file: string, content = "fake-video", mtime?: Date): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  if (mtime) fs.utimesSync(file, mtime, mtime);
  return file;
}

export function insertSource(db: AppDatabase, root: string, extra: Partial<typeof schema.mediaSources.$inferInsert> = {}) {
  return db
    .insert(schema.mediaSources)
    .values({ name: path.basename(root), path: root, createdAt: Date.now(), ...extra })
    .returning()
    .get();
}

export const fakeProbe = async () => ({
  durationSec: 120,
  width: 1920,
  height: 1080,
  videoCodec: "h264",
  audioCodec: "aac",
  containerFormat: "mov,mp4,m4a,3gp,3g2,mj2",
  fps: 23.976,
  bitrate: 5_000_000,
});
