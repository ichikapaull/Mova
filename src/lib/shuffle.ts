/**
 * Shuffle playback is a seeded permutation of the library: the same seed always yields
 * the same order, so previous/next stay consistent and nothing repeats until every
 * video has played. The seed travels in the player's `list` param ("shuffle:<seed>").
 * Each video's place depends only on (seed, id), so adding or removing videos never
 * reorders the rest.
 */

const PREFIX = "shuffle:";

export function newShuffleSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000);
}

export function shuffleListParam(seed: number): string {
  return `${PREFIX}${seed.toString(36)}`;
}

/** Seed in its URL form (base36), as produced by `shuffleListParam`. */
export function parseShuffleSeed(raw: string | null | undefined): number | null {
  if (!raw || !/^[0-9a-z]{1,7}$/.test(raw)) return null;
  const seed = parseInt(raw, 36);
  return seed < 0x1_0000_0000 ? seed : null;
}

export function parseShuffleListParam(list: string | null | undefined): number | null {
  return list?.startsWith(PREFIX) ? parseShuffleSeed(list.slice(PREFIX.length)) : null;
}

/** murmur3's finalizer over the seeded id: a well-mixed 32-bit sort key. */
function rank(id: number, seed: number): number {
  let h = (seed ^ Math.imul(id, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function shuffleIds(ids: readonly number[], seed: number): number[] {
  return ids
    .map((id) => [rank(id, seed), id] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([, id]) => id);
}
