import type { Metadata } from "next";
import { SetupWizard } from "@/components/settings/setup-wizard";
import { getFfmpegStatus } from "@/server/ffmpeg/detect";
import { listSources } from "@/server/repositories/sources";

export const metadata: Metadata = { title: "Welcome" };

export default async function SetupPage() {
  const ffmpeg = await getFfmpegStatus();
  return (
    <SetupWizard
      initialSources={listSources().map(({ id, name, path, videoCount }) => ({ id, name, path, videoCount }))}
      ffmpegAvailable={ffmpeg.available}
      ffmpegError={ffmpeg.error}
    />
  );
}
