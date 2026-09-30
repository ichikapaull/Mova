import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertServableMediaPath, isPathInside, isVideoFile, MediaPathError, normalizeSourcePath } from "@/server/media-paths";
import { makeTempDir, writeFakeVideo } from "./helpers";

describe("normalizeSourcePath", () => {
  it("accepts absolute paths and strips trailing slashes and dot segments", () => {
    expect(normalizeSourcePath("/media/anime/")).toBe("/media/anime");
    expect(normalizeSourcePath("  /media/./anime/../movies ")).toBe("/media/movies");
    expect(normalizeSourcePath("/")).toBe("/");
  });

  it("rejects relative, empty and NUL-containing paths", () => {
    expect(() => normalizeSourcePath("media/anime")).toThrow(MediaPathError);
    expect(() => normalizeSourcePath("")).toThrow(MediaPathError);
    expect(() => normalizeSourcePath("/media/\0anime")).toThrow(MediaPathError);
  });
});

describe("isPathInside", () => {
  it("accepts files below the root", () => {
    expect(isPathInside("/media/anime", "/media/anime/naruto/ep1.mkv")).toBe(true);
  });

  it("rejects the root itself and sibling folders sharing a prefix", () => {
    expect(isPathInside("/media/anime", "/media/anime")).toBe(false);
    expect(isPathInside("/media/anime", "/media/anime-old/ep1.mkv")).toBe(false);
  });

  it("rejects traversal attempts", () => {
    expect(isPathInside("/media/anime", "/media/anime/../../etc/passwd")).toBe(false);
    expect(isPathInside("/media/anime", "/etc/passwd")).toBe(false);
    expect(isPathInside("/media/anime", "/media/anime/..")).toBe(false);
  });

  it("rejects relative inputs and NUL bytes", () => {
    expect(isPathInside("media", "media/x.mp4")).toBe(false);
    expect(isPathInside("/media", "/media/x\0.mp4")).toBe(false);
  });
});

describe("isVideoFile", () => {
  it("matches supported extensions case-insensitively", () => {
    for (const name of ["a.mp4", "b.MKV", "c.webm", "d.mov", "e.avi", "f.m4v"]) expect(isVideoFile(name)).toBe(true);
    for (const name of ["passwd", "a.txt", "a.jpg", "mp4"]) expect(isVideoFile(name)).toBe(false);
  });
});

describe("assertServableMediaPath", () => {
  it("returns stats for a valid file inside the source", async () => {
    const root = makeTempDir();
    const file = writeFakeVideo(path.join(root, "show", "ep1.mp4"), "12345");
    await expect(assertServableMediaPath(root, file)).resolves.toMatchObject({ size: 5 });
  });

  it("refuses non-normalized paths (traversal)", async () => {
    const root = makeTempDir();
    await expect(assertServableMediaPath(root, `${root}/../../etc/passwd`)).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses files outside the source even if they exist", async () => {
    const root = makeTempDir();
    const other = makeTempDir();
    const file = writeFakeVideo(path.join(other, "secret.mp4"));
    await expect(assertServableMediaPath(root, file)).rejects.toMatchObject({ code: "outside-source" });
  });

  it("refuses non-video files", async () => {
    const root = makeTempDir();
    const file = path.join(root, "notes.txt");
    fs.writeFileSync(file, "hi");
    await expect(assertServableMediaPath(root, file)).rejects.toMatchObject({ code: "unsupported" });
  });

  it("refuses a video-named symlink pointing at a non-video file", async () => {
    const root = makeTempDir();
    const link = path.join(root, "evil.mp4");
    fs.symlinkSync("/etc/passwd", link);
    await expect(assertServableMediaPath(root, link)).rejects.toMatchObject({ code: "unsupported" });
  });

  it("reports missing files", async () => {
    const root = makeTempDir();
    await expect(assertServableMediaPath(root, path.join(root, "gone.mkv"))).rejects.toMatchObject({ code: "not-found" });
  });
});
