import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { GET, HEAD } from "@/app/api/media/[id]/stream/route";
import { schema } from "@/server/db";
import { indexSourceFiles } from "@/server/scanner";
import { insertSource, makeTempDir, setupTestDatabase, writeFakeVideo } from "./helpers";

const CONTENT = "0123456789abcdefghij"; // 20 bytes

function call(handler: typeof GET, id: number | string, headers: Record<string, string> = {}, method = "GET") {
  return handler(new Request(`http://127.0.0.1/api/media/${id}/stream`, { headers, method }), { params: Promise.resolve({ id: String(id) }) });
}

describe("GET /api/media/[id]/stream", () => {
  let db: ReturnType<typeof setupTestDatabase>;
  let root: string;
  let id: number;

  beforeEach(() => {
    db = setupTestDatabase();
    root = makeTempDir();
    const source = insertSource(db, root);
    const file = writeFakeVideo(path.join(root, "clip.mp4"), CONTENT);
    const stat = fs.statSync(file);
    id = indexSourceFiles(source.id, root, [{ absolutePath: file, size: stat.size, mtimeMs: Math.floor(stat.mtimeMs), birthtimeMs: null }]).toProbe[0]!;
  });

  it("streams the whole file with range support advertised", async () => {
    const response = await call(GET, id);
    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("20");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(await response.text()).toBe(CONTENT);
  });

  it("serves partial content for range requests", async () => {
    const response = await call(GET, id, { range: "bytes=10-14" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 10-14/20");
    expect(await response.text()).toBe("abcde");
  });

  it("serves open-ended ranges", async () => {
    const response = await call(GET, id, { range: "bytes=15-" });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("fghij");
  });

  it("answers 416 for unsatisfiable ranges", async () => {
    const response = await call(GET, id, { range: "bytes=50-" });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */20");
  });

  it("supports HEAD without a body", async () => {
    const response = await call(HEAD, id, {}, "HEAD");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("20");
    expect(response.body).toBeNull();
  });

  it("rejects malformed ids (no path ever comes from the URL)", async () => {
    for (const bad of ["abc", "..%2F..%2Fetc%2Fpasswd", "-1", "1.5", "0"]) {
      expect((await call(GET, bad)).status).toBe(400);
    }
  });

  it("404s for unknown ids and removed videos", async () => {
    expect((await call(GET, 9999)).status).toBe(404);
    db.update(schema.media).set({ status: "removed" }).where(eq(schema.media.id, id)).run();
    expect((await call(GET, id)).status).toBe(404);
  });

  it("refuses a tampered database path pointing outside the media source", async () => {
    const outside = writeFakeVideo(path.join(makeTempDir(), "secret.mp4"));
    db.update(schema.media).set({ absolutePath: outside }).where(eq(schema.media.id, id)).run();
    const response = await call(GET, id);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "outside-source" });
  });

  it("refuses traversal sequences stored in the database", async () => {
    db.update(schema.media).set({ absolutePath: `${root}/../../../etc/passwd` }).where(eq(schema.media.id, id)).run();
    expect((await call(GET, id)).status).toBe(400);
  });

  it("returns 404 with a clear message when the file disappeared", async () => {
    fs.rmSync(path.join(root, "clip.mp4"));
    const response = await call(GET, id);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "not-found" });
  });

  it("returns 403 for disabled sources", async () => {
    db.update(schema.mediaSources).set({ enabled: false }).run();
    expect((await call(GET, id)).status).toBe(403);
  });
});
