import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { jsonError } from "@/server/http-file";
import { isVideoFile } from "@/server/media-paths";

/**
 * Lists sub-folders of a directory for the "Add folder" browser. Directory names
 * only; file contents are never read. Only reachable from localhost (see proxy.ts).
 */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("path") || os.homedir();
  if (!path.isAbsolute(requested) || requested.includes("\0")) return jsonError("Path must be absolute.", 400);
  const dir = path.resolve(requested);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const folders = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .slice(0, 1000);
    const videoCount = entries.filter((e) => e.isFile() && isVideoFile(e.name)).length;
    const parent = path.dirname(dir);
    return Response.json({
      path: dir,
      parent: parent === dir ? null : parent,
      folders,
      videoCount,
      shortcuts: [os.homedir(), "/mnt", "/media", `/run/media/${os.userInfo().username}`].filter((p, i, all) => all.indexOf(p) === i),
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return jsonError(code === "EACCES" ? "Permission denied." : "Folder not found.", code === "EACCES" ? 403 : 404);
  }
}
