export type ParsedEpisode = { seasonNumber: number | null; episodeNumber: number | null };

const PATTERNS: Array<{ regex: RegExp; season?: number; episode: number }> = [
  // S01E02, s1e2, S01.E02
  { regex: /\bs(\d{1,2})[ ._-]?e(\d{1,4}(?:\.\d)?)\b/i, season: 1, episode: 2 },
  // 1x02
  { regex: /\b(\d{1,2})x(\d{2,3})\b/i, season: 1, episode: 2 },
  // Season 2 Episode 5
  { regex: /\bseason[ ._-]?(\d{1,2}).*?\b(?:episode|ep)[ ._-]?(\d{1,4})\b/i, season: 1, episode: 2 },
  // Episode 23, Ep 23, EP23, Bölüm 23
  { regex: /\b(?:episode|ep|e|bölüm|bolum)[ ._-]?(\d{1,4}(?:\.\d)?)\b/i, episode: 1 },
  // "Show - 23", "Show - 23v2", "Show - 23 [1080p]"
  { regex: /\s-\s(\d{1,4}(?:\.\d)?)(?:v\d)?(?:\s|$|\[|\()/, episode: 1 },
  // "[23]" or "(23)"
  { regex: /[[(](\d{1,4})[\])]/, episode: 1 },
  // "#23"
  { regex: /#(\d{1,4})\b/, episode: 1 },
];

const NOISE = /\[(?:[^\]]*?(?:\d{3,4}p|x26[45]|hevc|h\.?26[45]|aac|flac|bd|web|10bit)[^\]]*)\]|\((?:[^)]*?(?:\d{3,4}p|x26[45]|hevc)[^)]*)\)|\b(?:19|20)\d{2}\b|\b\d{3,4}p\b|\bx26[45]\b/gi;

/**
 * Best-effort season/episode detection from a filename (without extension).
 * Resolution tags, years and codec markers are ignored.
 */
export function parseEpisodeFromFilename(filename: string): ParsedEpisode {
  const base = filename.replace(/\.[a-z0-9]{2,4}$/i, "").replace(NOISE, " ").replace(/_/g, " ");
  for (const pattern of PATTERNS) {
    const match = pattern.regex.exec(base);
    if (!match) continue;
    const episode = Number(match[pattern.episode]);
    if (!Number.isFinite(episode)) continue;
    const season = pattern.season ? Number(match[pattern.season]) : null;
    return { seasonNumber: season, episodeNumber: episode };
  }
  // Fallback: a single trailing number ("Naruto 023").
  const trailing = /(?:^|\s)(\d{1,4})\s*$/.exec(base.trim());
  if (trailing) return { seasonNumber: null, episodeNumber: Number(trailing[1]) };
  return { seasonNumber: null, episodeNumber: null };
}

/** Turns "Naruto.Shippuden.S01E02.1080p.mkv" into "Naruto Shippuden S01E02". */
export function titleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[a-z0-9]{2,4}$/i, "");
  const cleaned = withoutExt
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || withoutExt || filename;
}
