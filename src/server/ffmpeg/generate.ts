import fs from "node:fs/promises";
import path from "node:path";
import { TMP_DIR } from "@/server/config";
import { FFMPEG_PATH, type FfmpegStatus } from "./detect";
import { ProcessError, runProcess, summarizeFfmpegError } from "./run";

async function atomicOutput(finalPath: string, extension: string, produce: (tmpPath: string) => Promise<void>): Promise<void> {
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  const tmpPath = path.join(TMP_DIR, `${path.basename(finalPath, path.extname(finalPath))}-${process.pid}-${Date.now()}.${extension}`);
  try {
    await produce(tmpPath);
    const stat = await fs.stat(tmpPath);
    if (stat.size === 0) throw new ProcessError("FFmpeg produced an empty file.");
    await fs.rename(tmpPath, finalPath);
  } finally {
    await fs.rm(tmpPath, { force: true });
  }
}

/** Seek position for the thumbnail frame, falling back to a few seconds in. */
export function thumbnailTimestamp(durationSec: number | null, position: number): number {
  if (!durationSec || durationSec <= 0) return 3;
  return Math.max(0, Math.min(durationSec * position, durationSec - 0.5));
}

async function extractFrame(input: string, output: string, atSec: number): Promise<void> {
  const result = await runProcess(
    FFMPEG_PATH,
    [
      "-hide_banner",
      "-loglevel", "error",
      "-ss", atSec.toFixed(2),
      "-i", input,
      "-map", "0:v:0",
      "-frames:v", "1",
      "-vf", "scale=640:-2:flags=lanczos",
      "-q:v", "4",
      "-y", output,
    ],
    { timeoutMs: 60_000 },
  );
  if (result.code !== 0) throw new ProcessError(summarizeFfmpegError(result.stderr), result);
}

/** Writes a 640px-wide JPEG thumbnail. Retries at the first frame if seeking fails. */
export async function generateThumbnail(input: string, output: string, durationSec: number | null, position: number): Promise<void> {
  await atomicOutput(output, "jpg", async (tmp) => {
    try {
      await extractFrame(input, tmp, thumbnailTimestamp(durationSec, position));
      const stat = await fs.stat(tmp).catch(() => null);
      if (!stat?.size) throw new ProcessError("No frame at requested position.");
    } catch {
      await extractFrame(input, tmp, 0);
    }
  });
}

/**
 * Picks evenly spread segment start times for a stitched preview.
 * Short videos get a single segment from the start.
 */
export function previewSegments(durationSec: number | null, lengthSec: number): Array<{ start: number; length: number }> {
  if (!durationSec || durationSec <= lengthSec + 2) {
    return [{ start: 0, length: Math.min(lengthSec, durationSec ?? lengthSec) }];
  }
  const count = durationSec > 120 ? 4 : durationSec > 40 ? 3 : 1;
  const segmentLength = lengthSec / count;
  if (count === 1) return [{ start: Math.max(0, durationSec * 0.2), length: lengthSec }];
  const points = count === 4 ? [0.15, 0.35, 0.55, 0.75] : [0.2, 0.45, 0.7];
  return points.map((p) => ({ start: Math.min(durationSec * p, durationSec - segmentLength - 0.5), length: segmentLength }));
}

export function previewFileExtension(encoder: FfmpegStatus["previewEncoder"]): "mp4" | "webm" {
  return encoder === "libvpx" || encoder === "libvpx-vp9" ? "webm" : "mp4";
}

/**
 * Writes a short, muted, low-resolution preview composed of a few segments
 * spread across the video (Netflix-style teaser).
 */
export async function generatePreview(
  input: string,
  output: string,
  options: { durationSec: number | null; lengthSec: number; height: number; encoder: NonNullable<FfmpegStatus["previewEncoder"]> },
): Promise<void> {
  const segments = previewSegments(options.durationSec, options.lengthSec);
  const inputArgs = segments.flatMap((s) => ["-ss", s.start.toFixed(2), "-t", s.length.toFixed(2), "-i", input]);
  const scale = `scale=-2:${options.height}:flags=bicubic,fps=24,setsar=1,format=yuv420p`;
  const filter =
    segments.map((_, i) => `[${i}:v:0]${scale}[v${i}]`).join(";") +
    `;${segments.map((_, i) => `[v${i}]`).join("")}concat=n=${segments.length}:v=1:a=0[out]`;

  const codecArgs =
    options.encoder === "libx264"
      ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-profile:v", "main", "-movflags", "+faststart"]
      : options.encoder === "libopenh264"
        ? ["-c:v", "libopenh264", "-b:v", "600k", "-movflags", "+faststart"]
        : ["-c:v", options.encoder, "-b:v", "600k", "-deadline", "realtime", "-cpu-used", "8"];

  const extension = previewFileExtension(options.encoder);
  await atomicOutput(output, extension, async (tmp) => {
    const result = await runProcess(
      FFMPEG_PATH,
      ["-hide_banner", "-loglevel", "error", ...inputArgs, "-filter_complex", filter, "-map", "[out]", "-an", ...codecArgs, "-y", tmp],
      { timeoutMs: 180_000 },
    );
    if (result.code !== 0) throw new ProcessError(summarizeFfmpegError(result.stderr), result);
  });
}
