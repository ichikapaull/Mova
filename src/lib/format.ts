/**
 * Fixed UI locale: server and browser must format identically (hydration),
 * and the interface is English.
 */
const LOCALE = "en-GB";

/** 754 → "12:34", 3754 → "1:02:34". */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
  const seconds = Math.floor(totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

/** Human-friendly runtime: "1h 42m", "24m", "45s". */
export function formatRuntime(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "";
  const minutes = Math.round(totalSeconds / 60);
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  if (totalSeconds < 600) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.round(totalSeconds % 60);
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Height-based resolution label: 1080p, 4K, … */
export function formatResolution(width: number | null | undefined, height: number | null | undefined): string | null {
  if (!width || !height) return null;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  if (longSide >= 3800 || shortSide >= 2100) return "4K";
  if (longSide >= 2500 || shortSide >= 1400) return "1440p";
  if (longSide >= 1900 || shortSide >= 1000) return "1080p";
  if (longSide >= 1200 || shortSide >= 700) return "720p";
  if (shortSide >= 540) return "576p";
  if (shortSide >= 470) return "480p";
  return `${shortSide}p`;
}

export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString(LOCALE, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(timestamp: number | null | undefined, now = Date.now()): string {
  if (!timestamp) return "never";
  const diff = Math.round((timestamp - now) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  if (abs < 60) return rtf.format(diff, "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(timestamp);
}

export function formatEpisodeLabel(season: number | null | undefined, episode: number | null | undefined): string | null {
  if (episode == null && season == null) return null;
  const ep = episode != null ? `E${String(episode).padStart(2, "0")}` : "";
  const s = season != null ? `S${String(season).padStart(2, "0")}` : "";
  return `${s}${ep}` || null;
}

export function formatCount(value: number): string {
  return value.toLocaleString(LOCALE);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString(LOCALE)} ${count === 1 ? singular : plural}`;
}
