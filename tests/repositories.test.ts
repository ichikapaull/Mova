import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings";
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
  return { db, root, ids: toProbe };
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
