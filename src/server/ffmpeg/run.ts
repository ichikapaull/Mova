import { spawn } from "node:child_process";

export type RunResult = { code: number | null; stdout: string; stderr: string };

export class ProcessError extends Error {
  constructor(
    message: string,
    readonly result?: RunResult,
  ) {
    super(message);
    this.name = "ProcessError";
  }
}

/**
 * Runs a binary with an argument array (never through a shell) and collects output.
 * Output is capped to avoid unbounded memory use on noisy processes.
 */
export function runProcess(
  command: string,
  args: string[],
  options: { timeoutMs?: number; maxOutputBytes?: number; signal?: AbortSignal } = {},
): Promise<RunResult> {
  const { timeoutMs = 60_000, maxOutputBytes = 4 * 1024 * 1024 } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], signal: options.signal });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < maxOutputBytes) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      // Keep only the tail of stderr; the useful ffmpeg error is at the end.
      stderr = (stderr + chunk.toString("utf8")).slice(-16_384);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new ProcessError(error.code === "ENOENT" ? `${command} was not found on PATH.` : `Failed to start ${command}: ${error.message}`),
      );
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const result = { code, stdout, stderr };
      if (signal === "SIGKILL") return reject(new ProcessError(`${command} timed out after ${Math.round(timeoutMs / 1000)}s.`, result));
      resolve(result);
    });
  });
}

/** Last meaningful line of ffmpeg stderr, for user-facing error messages. */
export function summarizeFfmpegError(stderr: string): string {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) ?? "Unknown FFmpeg error").slice(0, 300);
}
