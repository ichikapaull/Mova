import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Starts a detached GUI process (never through a shell). Resolves once it spawned or failed. */
function launch(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/** Like launch, but waits for the exit code (for quick CLI tools such as dbus-send). */
function runQuick(command: string, args: string[], timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/**
 * Reveals a file in the system file manager. On Linux this uses the freedesktop
 * FileManager1 D-Bus interface (Dolphin, Nautilus, Nemo, Thunar…) so the file is
 * selected, and falls back to opening the containing folder with xdg-open.
 */
export async function revealInFileManager(filePath: string): Promise<boolean> {
  switch (process.platform) {
    case "darwin":
      return launch("open", ["-R", filePath]);
    case "win32":
      return launch("explorer.exe", [`/select,${filePath}`]);
    default: {
      const selected = await runQuick("dbus-send", [
        "--session",
        "--print-reply",
        "--dest=org.freedesktop.FileManager1",
        "--type=method_call",
        "/org/freedesktop/FileManager1",
        "org.freedesktop.FileManager1.ShowItems",
        `array:string:${pathToFileURL(filePath).href}`,
        "string:",
      ]);
      return selected || launch("xdg-open", [path.dirname(filePath)]);
    }
  }
}

/** Opens a file with the system's default application (e.g. mpv/VLC for unsupported codecs). */
export async function openWithDefaultApp(filePath: string): Promise<boolean> {
  switch (process.platform) {
    case "darwin":
      return launch("open", [filePath]);
    case "win32":
      return launch("cmd.exe", ["/c", "start", '""', filePath]);
    default:
      return launch("xdg-open", [filePath]);
  }
}
