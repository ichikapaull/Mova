import { FFPROBE_PATH } from "./detect";
import { ProcessError, runProcess, summarizeFfmpegError } from "./run";

export type ProbeResult = {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  containerFormat: string | null;
  fps: number | null;
  bitrate: number | null;
};

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  bit_rate?: string;
  disposition?: { attached_pic?: number };
  side_data_list?: Array<{ rotation?: number }>;
  tags?: { rotate?: string };
};

type FfprobeOutput = {
  streams?: FfprobeStream[];
  format?: { format_name?: string; duration?: string; bit_rate?: string };
};

function parseRate(rate: string | undefined): number | null {
  if (!rate) return null;
  const [num, den] = rate.split("/").map(Number);
  if (!num || !Number.isFinite(num)) return null;
  const value = den ? num / den : num;
  return Number.isFinite(value) && value > 0 && value < 1000 ? Math.round(value * 1000) / 1000 : null;
}

function parsePositive(value: string | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Converts raw ffprobe JSON into the fields Mova stores. Exported for tests. */
export function parseProbeOutput(json: string): ProbeResult {
  const data = JSON.parse(json) as FfprobeOutput;
  const streams = data.streams ?? [];
  // Cover art in mkv/mp4 shows up as a video stream; skip it.
  const video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audio = streams.find((s) => s.codec_type === "audio");

  let width = video?.width ?? null;
  let height = video?.height ?? null;
  const rotation = Math.abs(Number(video?.side_data_list?.find((d) => d.rotation != null)?.rotation ?? video?.tags?.rotate ?? 0));
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];

  const durationSec = parsePositive(data.format?.duration) ?? parsePositive(video?.duration);
  const bitrate = parsePositive(data.format?.bit_rate) ?? parsePositive(video?.bit_rate);

  return {
    durationSec: durationSec != null ? Math.round(durationSec * 1000) / 1000 : null,
    width,
    height,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    containerFormat: data.format?.format_name ?? null,
    fps: parseRate(video?.avg_frame_rate) ?? parseRate(video?.r_frame_rate),
    bitrate: bitrate != null ? Math.round(bitrate) : null,
  };
}

export async function probeMediaFile(filePath: string): Promise<ProbeResult> {
  const result = await runProcess(
    FFPROBE_PATH,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "--", filePath],
    { timeoutMs: 30_000 },
  );
  if (result.code !== 0) throw new ProcessError(`ffprobe failed: ${summarizeFfmpegError(result.stderr)}`, result);
  try {
    return parseProbeOutput(result.stdout);
  } catch {
    throw new ProcessError("ffprobe returned unreadable output.", result);
  }
}
