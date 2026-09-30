import { eq, inArray } from "drizzle-orm";
import { formatEpisodeLabel } from "@/lib/format";
import { parseShuffleListParam, shuffleIds } from "@/lib/shuffle";
import { naturalCompare } from "@/lib/utils";
import { getDb, schema } from "@/server/db";
import { getCollection, getCollectionMediaIds } from "@/server/repositories/collections";
import { listPlayableMedia, type PlayableMedia } from "@/server/repositories/library";
import { getContinuationNeighbors } from "@/server/repositories/relations";
import { getSeriesNeighbors } from "@/server/repositories/series";

export type PlaybackNeighbor = { id: number; title: string; label: string | null };

export type PlaybackContext = {
  kind: "shuffle" | "series" | "collection" | "continuation" | "folder" | null;
  /** e.g. "Naruto · S01E03" */
  label: string | null;
  href: string | null;
  previous: PlaybackNeighbor | null;
  next: PlaybackNeighbor | null;
  /** Query string to keep the context when moving to next/previous. */
  listParam: string | null;
};

function describe(ids: Array<number | null | undefined>): Map<number, string> {
  const wanted = ids.filter((id): id is number => typeof id === "number");
  if (wanted.length === 0) return new Map();
  return new Map(
    getDb()
      .select({ id: schema.media.id, title: schema.media.displayTitle })
      .from(schema.media)
      .where(inArray(schema.media.id, wanted))
      .all()
      .map((row) => [row.id, row.title]),
  );
}

/** Directory segments of a source-relative path ("" for files at the source root). */
function folderSegments(relativePath: string): string[] {
  return relativePath.split("/").slice(0, -1);
}

/** File-tree order: source, then folder by folder, then file name, all numeric-aware. */
function compareTreeOrder(a: PlayableMedia, b: PlayableMedia): number {
  const bySource = naturalCompare(a.sourceName, b.sourceName) || a.sourceId - b.sourceId;
  if (bySource) return bySource;
  const aDirs = folderSegments(a.relativePath);
  const bDirs = folderSegments(b.relativePath);
  for (let i = 0; i < Math.min(aDirs.length, bDirs.length); i++) {
    const bySegment = naturalCompare(aDirs[i]!, bDirs[i]!);
    if (bySegment) return bySegment;
  }
  return aDirs.length - bDirs.length || naturalCompare(a.relativePath, b.relativePath) || a.id - b.id;
}

function shuffleContext(mediaId: number, seed: number, list: string): PlaybackContext | null {
  const ids = shuffleIds(
    listPlayableMedia().map((row) => row.id),
    seed,
  );
  const index = ids.indexOf(mediaId);
  if (index === -1) return null;
  // Endless: wraps around, so every video has a neighbor once there are two.
  const prevId = ids.length > 1 ? ids[(index - 1 + ids.length) % ids.length]! : null;
  const nextId = ids.length > 1 ? ids[(index + 1) % ids.length]! : null;
  const titles = describe([prevId, nextId]);
  const make = (id: number | null) => (id ? { id, title: titles.get(id) ?? "", label: null } : null);
  return { kind: "shuffle", label: "Shuffle", href: null, previous: make(prevId), next: make(nextId), listParam: list };
}

/** Fallback for videos outside any series/collection: walk the library in file-tree order. */
function folderContext(mediaId: number): PlaybackContext | null {
  const ordered = listPlayableMedia().sort(compareTreeOrder);
  const index = ordered.findIndex((row) => row.id === mediaId);
  const current = ordered[index];
  if (!current || ordered.length < 2) return null;
  const prevId = ordered[index - 1]?.id ?? null;
  const nextId = ordered[index + 1]?.id ?? null;
  const titles = describe([prevId, nextId]);
  const make = (id: number | null) => (id ? { id, title: titles.get(id) ?? "", label: null } : null);

  const folder = folderSegments(current.relativePath).join("/");
  const siblings = ordered.filter((row) => row.sourceId === current.sourceId && folderSegments(row.relativePath).join("/") === folder);
  const folderName = folder.split("/").at(-1) || current.sourceName;
  return {
    kind: "folder",
    label: `${folderName} · ${siblings.indexOf(current) + 1}/${siblings.length}`,
    href: null,
    previous: make(prevId),
    next: make(nextId),
    listParam: null,
  };
}

/**
 * Resolves previous/next videos for the player. Shuffle wins, then an explicit collection
 * context, series order, "continuation" relations and finally the library's folder order.
 */
export function getPlaybackContext(mediaId: number, list?: string | null): PlaybackContext {
  const shuffleSeed = parseShuffleListParam(list);
  if (shuffleSeed != null) {
    const shuffled = shuffleContext(mediaId, shuffleSeed, list!);
    if (shuffled) return shuffled;
  }

  const collectionMatch = list ? /^collection:(\d+)$/.exec(list) : null;
  if (collectionMatch) {
    const collectionId = Number(collectionMatch[1]);
    const ids = getCollectionMediaIds(collectionId);
    const index = ids.indexOf(mediaId);
    const collection = getCollection(collectionId);
    if (index !== -1 && collection) {
      const prevId = ids[index - 1];
      const nextId = ids[index + 1];
      const titles = describe([prevId, nextId]);
      return {
        kind: "collection",
        label: `${collection.name} · ${index + 1}/${ids.length}`,
        href: `/collections/${collectionId}`,
        previous: prevId ? { id: prevId, title: titles.get(prevId) ?? "", label: null } : null,
        next: nextId ? { id: nextId, title: titles.get(nextId) ?? "", label: null } : null,
        listParam: `collection:${collectionId}`,
      };
    }
  }

  const series = getSeriesNeighbors(mediaId);
  if (series) {
    const titles = describe([series.previous?.mediaId, series.next?.mediaId]);
    const toNeighbor = (episode: typeof series.previous): PlaybackNeighbor | null =>
      episode
        ? {
            id: episode.mediaId,
            title: titles.get(episode.mediaId) ?? episode.title,
            label: formatEpisodeLabel(episode.seasonNumber, episode.episodeNumber),
          }
        : null;
    const currentLabel = series.current ? formatEpisodeLabel(series.current.seasonNumber, series.current.episodeNumber) : null;
    return {
      kind: "series",
      label: currentLabel ? `${series.series.title} · ${currentLabel}` : series.series.title,
      href: `/series/${series.series.id}`,
      previous: toNeighbor(series.previous),
      next: toNeighbor(series.next),
      listParam: null,
    };
  }

  const continuation = getContinuationNeighbors(mediaId);
  if (continuation.previous || continuation.next) {
    const titles = describe([continuation.previous, continuation.next]);
    const available = new Set(
      getDb()
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(inArray(schema.media.id, [continuation.previous ?? -1, continuation.next ?? -1]))
        .all()
        .map((row) => row.id),
    );
    const make = (id: number | null) => (id && available.has(id) ? { id, title: titles.get(id) ?? "", label: null } : null);
    return { kind: "continuation", label: null, href: null, previous: make(continuation.previous), next: make(continuation.next), listParam: null };
  }

  return folderContext(mediaId) ?? { kind: null, label: null, href: null, previous: null, next: null, listParam: null };
}

export function mediaExists(id: number): boolean {
  return Boolean(getDb().select({ id: schema.media.id }).from(schema.media).where(eq(schema.media.id, id)).get());
}
