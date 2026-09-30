import { eq, inArray } from "drizzle-orm";
import { formatEpisodeLabel } from "@/lib/format";
import { getDb, schema } from "@/server/db";
import { getCollection, getCollectionMediaIds } from "@/server/repositories/collections";
import { getContinuationNeighbors } from "@/server/repositories/relations";
import { getSeriesNeighbors } from "@/server/repositories/series";

export type PlaybackNeighbor = { id: number; title: string; label: string | null };

export type PlaybackContext = {
  kind: "series" | "collection" | "continuation" | null;
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

/**
 * Resolves previous/next videos for the player. An explicit collection context wins,
 * then series order, then "continuation" relations.
 */
export function getPlaybackContext(mediaId: number, list?: string | null): PlaybackContext {
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

  return { kind: null, label: null, href: null, previous: null, next: null, listParam: null };
}

export function mediaExists(id: number): boolean {
  return Boolean(getDb().select({ id: schema.media.id }).from(schema.media).where(eq(schema.media.id, id)).get());
}
