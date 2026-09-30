import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { schema } from "@/server/db";
import { addTagsToMedia } from "@/server/repositories/taxonomy";
import { removeFromLibrary } from "@/server/repositories/media";
import { indexSourceFiles, scanSource, walkVideoFiles } from "@/server/scanner";
import { fakeProbe, insertSource, makeTempDir, setupTestDatabase, writeFakeVideo } from "./helpers";

type Db = ReturnType<typeof setupTestDatabase>;

function allMedia(db: Db) {
  return db.select().from(schema.media).all();
}

describe("walkVideoFiles", () => {
  it("finds videos recursively and skips hidden folders and other files", async () => {
    const root = makeTempDir();
    writeFakeVideo(path.join(root, "a.mp4"));
    writeFakeVideo(path.join(root, "Show", "Season 1", "ep01.MKV"));
    writeFakeVideo(path.join(root, ".hidden", "secret.mp4"));
    fs.writeFileSync(path.join(root, "cover.jpg"), "x");
    const { files, errors } = await walkVideoFiles(root);
    expect(files.map((f) => path.relative(root, f.absolutePath)).sort()).toEqual(["Show/Season 1/ep01.MKV", "a.mp4"]);
    expect(errors).toEqual([]);
  });

  it("does not follow directory symlinks (no loops)", async () => {
    const root = makeTempDir();
    writeFakeVideo(path.join(root, "sub", "x.mp4"));
    fs.symlinkSync(root, path.join(root, "sub", "loop"));
    const { files } = await walkVideoFiles(root);
    expect(files).toHaveLength(1);
  });
});

describe("scanSource (incremental indexing)", () => {
  let db: Db;
  let root: string;
  let sourceId: number;

  beforeEach(() => {
    db = setupTestDatabase();
    root = makeTempDir();
    sourceId = insertSource(db, root).id;
  });

  const scan = () => scanSource(sourceId, { probe: fakeProbe, enqueueJobs: false });

  it("indexes new files with metadata and a readable title", async () => {
    writeFakeVideo(path.join(root, "Naruto.Shippuden.S01E02.1080p.mkv"));
    const summary = await scan();
    expect(summary).toMatchObject({ added: 1, probed: 1, missing: 0 });
    const [row] = allMedia(db);
    expect(row).toMatchObject({
      displayTitle: "Naruto Shippuden S01E02 1080p",
      extension: "mkv",
      relativePath: "Naruto.Shippuden.S01E02.1080p.mkv",
      durationSec: 120,
      width: 1920,
      probeStatus: "ready",
      status: "available",
    });
    expect(row?.searchText).toContain("naruto shippuden");
  });

  it("is incremental: unchanged files are not re-probed or duplicated", async () => {
    writeFakeVideo(path.join(root, "a.mp4"));
    await scan();
    const second = await scan();
    expect(second).toMatchObject({ added: 0, unchanged: 1, probed: 0 });
    expect(allMedia(db)).toHaveLength(1);
  });

  it("re-probes files whose size or mtime changed", async () => {
    const file = writeFakeVideo(path.join(root, "a.mp4"), "v1");
    await scan();
    writeFakeVideo(file, "version-2", new Date(Date.now() + 60_000));
    const summary = await scan();
    expect(summary).toMatchObject({ updated: 1, probed: 1 });
    expect(allMedia(db)[0]?.fileSize).toBe("version-2".length);
  });

  it("marks deleted files as missing instead of deleting them, and restores them", async () => {
    const mtime = new Date("2024-05-01T12:00:00Z");
    const file = writeFakeVideo(path.join(root, "a.mp4"), "content", mtime);
    writeFakeVideo(path.join(root, "keep.mp4"));
    await scan();
    fs.rmSync(file);
    expect(await scan()).toMatchObject({ missing: 1 });
    expect(allMedia(db).find((m) => m.filename === "a.mp4")?.status).toBe("missing");

    writeFakeVideo(file, "content", mtime);
    expect(await scan()).toMatchObject({ restored: 1 });
    expect(allMedia(db).find((m) => m.filename === "a.mp4")?.status).toBe("available");
  });

  it("detects moved/renamed files and keeps user metadata (duplicate detection)", async () => {
    const mtime = new Date("2024-01-01T00:00:00Z");
    const original = writeFakeVideo(path.join(root, "old-name.mp4"), "same-content", mtime);
    await scan();
    const [before] = allMedia(db);
    addTagsToMedia([before!.id], ["nostalgia"]);

    fs.mkdirSync(path.join(root, "moved"));
    const moved = path.join(root, "moved", "new-name.mp4");
    fs.renameSync(original, moved);
    const summary = await scan();

    expect(summary).toMatchObject({ added: 0, relinked: 1 });
    const rows = allMedia(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: before!.id, absolutePath: moved, filename: "new-name.mp4", displayTitle: "new-name", status: "available" });
    const tags = db.select().from(schema.mediaTags).where(eq(schema.mediaTags.mediaId, before!.id)).all();
    expect(tags).toHaveLength(1);
  });

  it("relinks files copied to a disk with coarse (2 s) timestamps", async () => {
    const original = writeFakeVideo(path.join(root, "movie.mp4"), "same-bytes", new Date("2024-01-01T00:00:00.000Z"));
    await scan();
    fs.rmSync(original);
    writeFakeVideo(path.join(root, "copied", "movie.mp4"), "same-bytes", new Date("2024-01-01T00:00:01.000Z"));
    expect(await scan()).toMatchObject({ added: 0, relinked: 1 });
  });

  it("does not create duplicates for the same path", async () => {
    const file = writeFakeVideo(path.join(root, "a.mp4"));
    const found = [{ absolutePath: file, size: 10, mtimeMs: 1, birthtimeMs: null }];
    indexSourceFiles(sourceId, root, found);
    indexSourceFiles(sourceId, root, found);
    expect(allMedia(db)).toHaveLength(1);
  });

  it("never re-adds videos the user removed from the library", async () => {
    writeFakeVideo(path.join(root, "a.mp4"));
    await scan();
    await removeFromLibrary([allMedia(db)[0]!.id]);
    expect(await scan()).toMatchObject({ added: 0 });
    expect(allMedia(db)[0]?.status).toBe("removed");
    expect(fs.existsSync(path.join(root, "a.mp4"))).toBe(true);
  });

  it("assigns the source's default category to new files", async () => {
    const category = db.insert(schema.categories).values({ name: "Anime", createdAt: 0 }).returning().get();
    db.update(schema.mediaSources).set({ defaultCategoryId: category.id }).where(eq(schema.mediaSources.id, sourceId)).run();
    writeFakeVideo(path.join(root, "a.mp4"));
    await scan();
    expect(db.select().from(schema.mediaCategories).all()).toEqual([{ mediaId: allMedia(db)[0]!.id, categoryId: category.id }]);
  });

  it("treats an unreachable folder as offline without marking files missing", async () => {
    writeFakeVideo(path.join(root, "a.mp4"));
    await scan();
    fs.rmSync(root, { recursive: true });
    const summary = await scan();
    expect(summary.offline).toBe(true);
    expect(allMedia(db)[0]?.status).toBe("available");
    expect(db.select().from(schema.mediaSources).get()?.isOnline).toBe(false);
  });

  it("treats an empty mount point as offline", async () => {
    const file = writeFakeVideo(path.join(root, "a.mp4"));
    await scan();
    fs.rmSync(file);
    const summary = await scan();
    expect(summary.offline).toBe(true);
    expect(allMedia(db)[0]?.status).toBe("available");
  });

  it("records probe failures without aborting the scan", async () => {
    writeFakeVideo(path.join(root, "broken.mp4"));
    writeFakeVideo(path.join(root, "fine.mp4"));
    const summary = await scanSource(sourceId, {
      enqueueJobs: false,
      probe: async (file) => {
        if (file.endsWith("broken.mp4")) throw new Error("moov atom not found");
        return fakeProbe();
      },
    });
    expect(summary).toMatchObject({ added: 2, probed: 1, probeFailed: 1 });
    expect(allMedia(db).find((m) => m.filename === "broken.mp4")).toMatchObject({ probeStatus: "failed", probeError: "moov atom not found" });
  });
});
