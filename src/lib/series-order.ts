import { naturalCompare } from "@/lib/utils";

export type EpisodeOrderFields = {
  mediaId: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
  position: number;
  title: string;
};

/** Seasons ascending (unnumbered specials first), then the explicit position inside a season. */
export function compareEpisodes(a: EpisodeOrderFields, b: EpisodeOrderFields): number {
  const seasonA = a.seasonNumber ?? -1;
  const seasonB = b.seasonNumber ?? -1;
  if (seasonA !== seasonB) return seasonA - seasonB;
  if (a.position !== b.position) return a.position - b.position;
  return naturalCompare(a.title, b.title);
}

export function sortEpisodes<T extends EpisodeOrderFields>(episodes: readonly T[]): T[] {
  return [...episodes].sort(compareEpisodes);
}

/**
 * Canonical order from season/episode numbers: episode ascending (unnumbered last),
 * then natural title order. Used when adding episodes and for "Sort by episode number".
 */
export function compareByEpisodeNumber(a: EpisodeOrderFields, b: EpisodeOrderFields): number {
  const seasonA = a.seasonNumber ?? -1;
  const seasonB = b.seasonNumber ?? -1;
  if (seasonA !== seasonB) return seasonA - seasonB;
  const epA = a.episodeNumber ?? Number.POSITIVE_INFINITY;
  const epB = b.episodeNumber ?? Number.POSITIVE_INFINITY;
  if (epA !== epB) return epA - epB;
  return naturalCompare(a.title, b.title);
}

/** Reassigns positions 0..n-1 following episode numbers. Returns mediaId → position. */
export function positionsByEpisodeNumber(episodes: readonly EpisodeOrderFields[]): Map<number, number> {
  const sorted = [...episodes].sort(compareByEpisodeNumber);
  return new Map(sorted.map((episode, index) => [episode.mediaId, index]));
}

export function findAdjacentEpisodes<T extends EpisodeOrderFields>(
  episodes: readonly T[],
  mediaId: number,
): { previous: T | null; next: T | null; index: number } {
  const sorted = sortEpisodes(episodes);
  const index = sorted.findIndex((episode) => episode.mediaId === mediaId);
  if (index === -1) return { previous: null, next: null, index: -1 };
  return { previous: sorted[index - 1] ?? null, next: sorted[index + 1] ?? null, index };
}
