import type { ActivityResponse } from "@/lib/activity";
import { getFfmpegStatus } from "@/server/ffmpeg/detect";
import { getJobQueue } from "@/server/jobs";
import { getScanProgress } from "@/server/scanner";

export async function GET() {
  const ffmpeg = await getFfmpegStatus();
  const body: ActivityResponse = {
    scan: getScanProgress(),
    jobs: getJobQueue().activity(),
    ffmpegAvailable: ffmpeg.available,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
