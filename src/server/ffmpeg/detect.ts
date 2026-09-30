import { runProcess } from "./run";

export type FfmpegStatus = {
  available: boolean;
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegVersion: string | null;
  ffprobeVersion: string | null;
  /** Video encoder used for hover previews. */
  previewEncoder: "libx264" | "libopenh264" | "libvpx-vp9" | "libvpx" | null;
  error: string | null;
  checkedAt: number;
};

export const FFMPEG_PATH = process.env.MOVA_FFMPEG_PATH || "ffmpeg";
export const FFPROBE_PATH = process.env.MOVA_FFPROBE_PATH || "ffprobe";

const globalForFfmpeg = globalThis as unknown as { __movaFfmpegStatus?: Promise<FfmpegStatus> };

async function readVersion(binary: string): Promise<string | null> {
  try {
    const result = await runProcess(binary, ["-hide_banner", "-version"], { timeoutMs: 10_000 });
    if (result.code !== 0) return null;
    const firstLine = result.stdout.split("\n")[0] ?? "";
    return /version\s+(\S+)/.exec(firstLine)?.[1] ?? firstLine.trim();
  } catch {
    return null;
  }
}

async function detectPreviewEncoder(): Promise<FfmpegStatus["previewEncoder"]> {
  try {
    const { stdout } = await runProcess(FFMPEG_PATH, ["-hide_banner", "-encoders"], { timeoutMs: 10_000 });
    for (const encoder of ["libx264", "libopenh264", "libvpx-vp9", "libvpx"] as const) {
      if (new RegExp(`\\s${encoder}\\s`).test(stdout)) return encoder;
    }
  } catch {
    // handled by caller via null
  }
  return null;
}

async function detect(): Promise<FfmpegStatus> {
  const [ffmpegVersion, ffprobeVersion] = await Promise.all([readVersion(FFMPEG_PATH), readVersion(FFPROBE_PATH)]);
  const previewEncoder = ffmpegVersion ? await detectPreviewEncoder() : null;
  const missing = [!ffmpegVersion && "ffmpeg", !ffprobeVersion && "ffprobe"].filter(Boolean);
  return {
    available: missing.length === 0,
    ffmpegPath: FFMPEG_PATH,
    ffprobePath: FFPROBE_PATH,
    ffmpegVersion,
    ffprobeVersion,
    previewEncoder,
    error: missing.length ? `${missing.join(" and ")} not found. FFmpeg is required for thumbnails and previews.` : null,
    checkedAt: Date.now(),
  };
}

/** Cached FFmpeg availability. Pass `refresh` to re-run detection. */
export function getFfmpegStatus(refresh = false): Promise<FfmpegStatus> {
  if (refresh || !globalForFfmpeg.__movaFfmpegStatus) globalForFfmpeg.__movaFfmpegStatus = detect();
  return globalForFfmpeg.__movaFfmpegStatus;
}
