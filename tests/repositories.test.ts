import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { parseShuffleListParam, shuffleIds, shuffleListParam } from "@/lib/shuffle";
import { schema } from "@/server/db";
import { addToCollection, getCollection, removeFromCollection, reorderCollection, createCollection } from "@/server/repositories/collections";
import { getPlaybackContext } from "@/server/repositories/playback";
import { addRelation, getContinuationNeighbors, getRelations } from "@/server/repositories/relations";
import { addEpisodes, autoNumberEpisodes, createSeries, getSeries, getSeriesResumeTarget, reorderEpisodes } from "@/server/repositories/series";
import { getSettings, updateSettings } from "@/server/repositories/settings";
import { addTagsToMedia, findOrCreateTag, listTags, renameTag } from "@/server/repositories/taxonomy";
import { setWatched } from "@/server/repositories/history";
import { addSource } from "@/server/repositories/sources";
import { indexSourceFiles } from "@/server/scanner";
import { insertSource, makeTempDir, setupTestDatabase } from "./helpers";

function seed(names: string[]) {
  const db = setupTestDatabase();
  const root = makeTempDir();
  const source = insertSource(db, root);
  const { toProbe } = indexSourceFiles(
    source.id,
    root,
    names.map((name, i) => ({ absolutePath: `${root}/${name}`, size: 100 + i, mtimeMs: 1 + i, birthtimeMs: null })),
  );
  return { db, root, source, ids: toProbe };
}

describe("settings", () => {
  beforeEach(() => void setupTestDatabase());

  it("returns defaults and persists validated updates", () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    updateSettings({ hoverDelayMs: 900, gridSize: "large" });
    expect(getSettings()).toMatchObject({ hoverDelayMs: 900, gridSize: "large" });
    expect(() => updateSettings({ hoverDelayMs: 5 })).toThrow();
  });
});

describe("tags", () => {
  it("dedupes case-insensitively and merges on rename", () => {
    const { ids } = seed(["a.mp4", "b.mp4"]);
    const first = findOrCreateTag("Action");
    expect(findOrCreateTag("  action ")).toEqual(first);
    addTagsToMedia([ids[0]!], ["Action"]);
    addTagsToMedia([ids[1]!], ["fight"]);
    const fight = findOrCreateTag("fight");
    renameTag(fight.id, "ACTION");
    expect(listTags()).toEqual([{ id: first.id, name: "Action", count: 2 }]);
  });
});

describe("collections", () => {
  it("appends in order, skips duplicates and persists manual order", () => {
    const { ids } = seed(["a.mp4", "b.mp4", "c.mp4"]);
    const collection = createCollection({ name: "Watch Later" });
    addToCollection(collection.id, [ids[0]!, ids[1]!]);
    addToCollection(collection.id, [ids[1]!, ids[2]!]);
    expect(getCollection(collection.id)?.items.map((i) => i.id)).toEqual(ids);
    reorderCollection(collection.id, [ids[2]!, ids[0]!, ids[1]!]);
    expect(getCollection(collection.id)?.items.map((i) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
    removeFromCollection(collection.id, [ids[0]!]);
    expect(getCollection(collection.id)?.items.map((i) => i.id)).toEqual([ids[2], ids[1]]);
  });
});

describe("series", () => {
  it("detects episode numbers, orders episodes and drives next/previous", () => {
    const { ids } = seed(["Show - 03.mkv", "Show - 01.mkv", "Show - 02.mkv"]);
    const series = createSeries({ title: "Show" });
    addEpisodes(series.id, ids.map((mediaId) => ({ mediaId })));
    const loaded = getSeries(series.id)!;
    expect(loaded.episodes.map((e) => e.episodeNumber)).toEqual([1, 2, 3]);
    const [ep1, ep2, ep3] = loaded.episodes.map((e) => e.id);

    const context = getPlaybackContext(ep2!);
    expect(context).toMatchObject({ kind: "series", previous: { id: ep1 }, next: { id: ep3, label: "E03" } });

    reorderEpisodes(series.id, [ep3!, ep1!, ep2!]);
    expect(getSeries(series.id)!.episodes.map((e) => e.id)).toEqual([ep3, ep1, ep2]);
    autoNumberEpisodes(series.id);
    expect(getSeries(series.id)!.episodes.map((e) => e.id)).toEqual([ep1, ep2, ep3]);

    setWatched([ep1!], true);
    expect(getSeriesResumeTarget(series.id)).toBe(ep2);
  });

  it("moves a video between series instead of duplicating it", () => {
    const { ids } = seed(["x.mp4"]);
    const a = createSeries({ title: "A" });
    const b = createSeries({ title: "B" });
    addEpisodes(a.id, [{ mediaId: ids[0]! }]);
    addEpisodes(b.id, [{ mediaId: ids[0]!, seasonNumber: 2, episodeNumber: 5 }]);
    expect(getSeries(a.id)!.episodes).toHaveLength(0);
    expect(getSeries(b.id)!.episodes[0]).toMatchObject({ seasonNumber: 2, episodeNumber: 5 });
  });
});

describe("relations", () => {
  it("links continuations both ways and keeps related links symmetric", () => {
    const { ids } = seed(["part1.mp4", "part2.mp4", "other.mp4"]);
    const [a, b, c] = ids as [number, number, number];
    addRelation(a, b, "continuation");
    addRelation(a, c, "related");
    addRelation(c, a, "related");
    expect(getContinuationNeighbors(a)).toEqual({ previous: null, next: b });
    expect(getContinuationNeighbors(b)).toEqual({ previous: a, next: null });
    const relations = getRelations(a);
    expect(relations.continuedBy.map((r) => r.id)).toEqual([b]);
    expect(relations.related.map((r) => r.id)).toEqual([c]);
    expect(getRelations(b).continues.map((r) => r.id)).toEqual([a]);
    expect(getPlaybackContext(a)).toMatchObject({ kind: "continuation", next: { id: b } });
    expect(() => addRelation(a, a, "related")).toThrow();
  });
});

describe("shuffle", () => {
  it("is a stable permutation per seed", () => {
    const ids = [5, 1, 9, 3, 7, 2];
    const order = shuffleIds(ids, 42);
    expect([...order].sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 7, 9]);
    expect(shuffleIds([...ids].reverse(), 42)).toEqual(order);
    expect(shuffleIds(ids, 43)).not.toEqual(order);
  });

  it("keeps the order of existing videos when the library grows", () => {
    const ids = Array.from({ length: 50 }, (_, i) => i + 1);
    const before = shuffleIds(ids, 9);
    const after = shuffleIds([...ids, 51, 52, 53], 9);
    expect(after.filter((id) => id <= 50)).toEqual(before);
  });

  it("round-trips the seed through the list param and rejects garbage", () => {
    expect(parseShuffleListParam(shuffleListParam(0xffffffff))).toBe(0xffffffff);
    expect(parseShuffleListParam(shuffleListParam(0))).toBe(0);
    expect(parseShuffleListParam("shuffle:zzzzzzz")).toBeNull();
    expect(parseShuffleListParam("shuffle:-1")).toBeNull();
    expect(parseShuffleListParam("collection:3")).toBeNull();
    expect(parseShuffleListParam(null)).toBeNull();
  });

  it("drives next/previous through the shuffle order, wrapping around", () => {
    const { ids } = seed(["a.mp4", "b.mp4", "c.mp4", "d.mp4"]);
    const list = shuffleListParam(7);
    const order = shuffleIds(ids, 7);
    const context = getPlaybackContext(order[0]!, list);
    expect(context).toMatchObject({ kind: "shuffle", listParam: list, previous: { id: order[3] }, next: { id: order[1] } });
    expect(getPlaybackContext(order[3]!, list).next?.id).toBe(order[0]);
  });

  it("skips videos on offline sources", () => {
    const { db, source, ids } = seed(["a.mp4", "b.mp4"]);
    db.update(schema.mediaSources).set({ isOnline: false }).where(eq(schema.mediaSources.id, source.id)).run();
    expect(getPlaybackContext(ids[0]!, shuffleListParam(7)).kind).toBeNull();
  });
});

describe("folder order fallback", () => {
  it("walks the library in numeric-aware file-tree order", () => {
    const { source, ids } = seed(["Show/Ep 10.mkv", "Show/Ep 2.mkv", "Show/Extras/bonus.mp4", "Movie.mp4", "Show/Ep 1.mkv"]);
    const [ep10, ep2, bonus, movie, ep1] = ids as [number, number, number, number, number];

    expect(getPlaybackContext(movie)).toMatchObject({ kind: "folder", label: `${source.name} · 1/1`, previous: null, next: { id: ep1 } });
    expect(getPlaybackContext(ep2)).toMatchObject({ kind: "folder", label: "Show · 2/3", previous: { id: ep1 }, next: { id: ep10 } });
    expect(getPlaybackContext(ep10).next?.id).toBe(bonus);
    expect(getPlaybackContext(bonus)).toMatchObject({ label: "Extras · 1/1", next: null });
  });

  it("leaves series order in charge", () => {
    const { ids } = seed(["Show - 01.mkv", "Show - 02.mkv", "Other.mp4"]);
    const series = createSeries({ title: "Show" });
    addEpisodes(series.id, [{ mediaId: ids[0]! }, { mediaId: ids[1]! }]);
    expect(getPlaybackContext(ids[1]!)).toMatchObject({ kind: "series", next: null });
  });
});

describe("media sources", () => {
  it("rejects missing, duplicate and overlapping folders", async () => {
    const db = setupTestDatabase();
    const root = makeTempDir();
    await addSource({ path: root });
    await expect(addSource({ path: root })).rejects.toThrow(/already/);
    await expect(addSource({ path: `${root}/../${root.split("/").at(-1)}` })).rejects.toThrow(/already/);
    await expect(addSource({ path: "/definitely/not/here" })).rejects.toThrow(/does not exist/);
    await expect(addSource({ path: "relative/path" })).rejects.toThrow(/absolute/);
    const nested = `${root}/nested`;
    (await import("node:fs")).mkdirSync(nested);
    await expect(addSource({ path: nested })).rejects.toThrow(/covered/);
    expect(db.select().from(schema.mediaSources).all()).toHaveLength(1);
  });
});
