import type { JobActivity } from "@/server/jobs";
import type { ScanProgress } from "@/server/scanner";

export type ActivityResponse = {
  scan: ScanProgress;
  jobs: JobActivity;
  ffmpegAvailable: boolean;
};
