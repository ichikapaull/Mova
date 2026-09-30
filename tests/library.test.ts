import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { normalizeSearchText, tokenizeSearchQuery } from "@/lib/search";
import { parseLibraryQuery, serializeLibraryQuery } from "@/lib/library-query";
import { schema } from "@/server/db";
import { recordProgress } from "@/server/repositories/history";
import { queryLibrary, queryLibraryIds } from "@/server/repositories/library";
import { setFavorite, updateMediaMetadata } from "@/server/repositories/media";
import { addCategoryToMedia, addTagsToMedia, createCategory } from "@/server/repositories/taxonomy";
import { applyProbeResult, indexSourceFiles } from "@/server/scanner";
import { fakeProbe, insertSource, makeTempDir, setupTestDatabase } from "./helpers";

describe("search normalization", () => {
  it("lowercases, strips diacritics and separators", () => {
    expect(normalizeSearchText("Şeker_Portakalı.Episode.23")).toBe("seker portakali episode 23");
    expect(tokenizeSearchQuery("  Naruto   EPISODE 23 ")).toEqual(["naruto", "episode", "23"]);
  });
});

describe("library query params", () => {
  it("round-trips through the URL and drops garbage", () => {
    const query = parseLibraryQuery(new URLSearchParams("q=naruto&sort=duration&dir=asc&tags=3,x,4&resolution=fhd,bogus&favorite=1&watch=nope"));
    expect(query).toEqual({ q: "naruto", sort: "duration", dir: "asc", tags: [3, 4], resolution: ["fhd"], favorite: true, watch: undefined });
    expect(serializeLibraryQuery(query).toString()).toBe("q=naruto&sort=duration&dir=asc&tags=3%2C4&resolution=fhd&favorite=1");
  });
});

describe("queryLibrary", () => {
  let ids: Record<string, number>;

  beforeEach(async () => {
    const db = setupTestDatabase();
    const root = makeTempDir();
    const source = insertSource(db, root);
    const files = [
      ["Naruto Episode 23.mkv", 1400, 1080, 100],
      ["Naruto Episode 24.mkv", 1500, 1080, 200],
      ["Your Name (Movie).mp4", 6400, 2160, 300],
      ["Cat clip.webm", 30, 720, 400],
    ] as const;
    const index = indexSourceFiles(
      source.id,
      root,
      files.map(([name, , , size]) => ({ absolutePath: `${root}/${name}`, size, mtimeMs: size, birthtimeMs: null })),
      1000,
    );
    ids = {};
    for (const [i, id] of index.toProbe.entries()) {
      const [name, duration, height] = files[i]!;
      applyProbeResult(id, { ...(await fakeProbe()), durationSec: duration, width: Math.round((height * 16) / 9), height });
      ids[name] = id;
      db.update(schema.media).set({ createdAt: 1000 + i }).where(eq(schema.media.id, id)).run();
    }
  });

  it("searches titles token by token, case-insensitively", () => {
    const page = queryLibrary({ q: "naruto episode 23" }, 0, 50);
    expect(page.items.map((i) => i.title)).toEqual(["Naruto Episode 23"]);
    expect(queryLibrary({ q: "NARUTO" }, 0, 50).total).toBe(2);
  });

  it("searches tags and categories too", () => {
    addTagsToMedia([ids["Cat clip.webm"]!], ["funny"]);
    const anime = createCategory({ name: "Anime" });
    addCategoryToMedia([ids["Naruto Episode 23.mkv"]!], anime.id);
    expect(queryLibrary({ q: "funny" }, 0, 50).items.map((i) => i.id)).toEqual([ids["Cat clip.webm"]]);
    expect(queryLibrary({ q: "anime" }, 0, 50).items.map((i) => i.id)).toEqual([ids["Naruto Episode 23.mkv"]]);
  });

  it("finds edited titles", () => {
    updateMediaMetadata(ids["Cat clip.webm"]!, { displayTitle: "Kedi videosu" });
    expect(queryLibrary({ q: "kedi" }, 0, 50).total).toBe(1);
  });

  it("filters by resolution, type, favorite, tags (all) and categories (any)", () => {
    expect(queryLibrary({ resolution: ["uhd"] }, 0, 50).items.map((i) => i.id)).toEqual([ids["Your Name (Movie).mp4"]]);
    expect(queryLibrary({ types: ["mkv"] }, 0, 50).total).toBe(2);
    setFavorite([ids["Cat clip.webm"]!], true);
    expect(queryLibrary({ favorite: true }, 0, 50).items.map((i) => i.id)).toEqual([ids["Cat clip.webm"]]);

    const [action, fav] = addTagsToMedia([ids["Naruto Episode 23.mkv"]!, ids["Naruto Episode 24.mkv"]!], ["action", "fav"]);
    addTagsToMedia([ids["Naruto Episode 24.mkv"]!], ["fav"]);
    addTagsToMedia([ids["Naruto Episode 23.mkv"]!], ["dark"]);
    expect(queryLibrary({ tags: [action!.id] }, 0, 50).total).toBe(2);
    expect(queryLibrary({ tags: [action!.id, fav!.id] }, 0, 50).total).toBe(2);
  });

  it("filters by watch state", () => {
    recordProgress(ids["Naruto Episode 23.mkv"]!, { positionSec: 1390, durationSec: 1400, sessionStart: true }, 0.92);
    recordProgress(ids["Naruto Episode 24.mkv"]!, { positionSec: 100, durationSec: 1500, sessionStart: true }, 0.92);
    expect(queryLibrary({ watch: "watched" }, 0, 50).items.map((i) => i.id)).toEqual([ids["Naruto Episode 23.mkv"]]);
    expect(queryLibrary({ watch: "in-progress" }, 0, 50).items.map((i) => i.id)).toEqual([ids["Naruto Episode 24.mkv"]]);
    expect(queryLibrary({ watch: "unwatched" }, 0, 50).total).toBe(2);
  });

  it("sorts and paginates", () => {
    expect(queryLibrary({ sort: "duration", dir: "desc" }, 0, 2).items.map((i) => i.durationSec)).toEqual([6400, 1500]);
    expect(queryLibrary({ sort: "duration", dir: "desc" }, 2, 2).items.map((i) => i.durationSec)).toEqual([1400, 30]);
    expect(queryLibrary({ sort: "name" }, 0, 50).items[0]?.title).toBe("Cat clip");
    expect(queryLibrary({}, 0, 50).items[0]?.title).toBe("Cat clip"); // newest first by default
    expect(queryLibraryIds({ sort: "size", dir: "asc" })).toEqual([
      ids["Naruto Episode 23.mkv"],
      ids["Naruto Episode 24.mkv"],
      ids["Your Name (Movie).mp4"],
      ids["Cat clip.webm"],
    ]);
  });

  it("escapes LIKE wildcards in search input", () => {
    expect(queryLibrary({ q: "%" }, 0, 50).total).toBe(0);
    expect(queryLibrary({ q: "nar%to" }, 0, 50).total).toBe(0);
  });
});
