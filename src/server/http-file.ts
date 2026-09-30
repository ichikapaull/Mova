import fs from "node:fs";
import { Readable } from "node:stream";
import { parseRangeHeader } from "@/server/http-range";

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  // Browsers play H.264/AAC .mov files only when announced as MP4.
  mov: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv",
  flv: "video/x-flv",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  ts: "video/mp2t",
  m2ts: "video/mp2t",
  "3gp": "video/3gpp",
  jpg: "image/jpeg",
};

export function contentTypeFor(extension: string): string {
  return CONTENT_TYPES[extension.toLowerCase()] ?? "application/octet-stream";
}

type ServeOptions = {
  contentType: string;
  size: number;
  mtimeMs: number;
  cacheControl: string;
};

/**
 * Streams a file with HTTP Range support. Only the requested byte window is read,
 * so seeking in multi-GB files is cheap. The read stream is destroyed when the
 * client aborts (the web stream is cancelled).
 */
export function serveFile(request: Request, filePath: string, options: ServeOptions): Response {
  const etag = `W/"${options.size.toString(16)}-${Math.floor(options.mtimeMs).toString(16)}"`;
  const baseHeaders: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Type": options.contentType,
    "Cache-Control": options.cacheControl,
    "Last-Modified": new Date(options.mtimeMs).toUTCString(),
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  if (request.headers.get("if-none-match") === etag && !request.headers.get("range")) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  const range = parseRangeHeader(request.headers.get("range"), options.size);
  if (range.kind === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...baseHeaders, "Content-Range": `bytes */${options.size}` } });
  }

  const start = range.kind === "range" ? range.range.start : 0;
  const end = range.kind === "range" ? range.range.end : options.size - 1;
  const length = options.size === 0 ? 0 : end - start + 1;
  const headers: Record<string, string> = { ...baseHeaders, "Content-Length": String(length) };
  if (range.kind === "range") headers["Content-Range"] = `bytes ${start}-${end}/${options.size}`;
  const status = range.kind === "range" ? 206 : 200;

  if (request.method === "HEAD" || length === 0) return new Response(null, { status, headers });

  const nodeStream = fs.createReadStream(filePath, { start, end, highWaterMark: 256 * 1024 });
  const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}

export function jsonError(message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: message, ...extra }, { status });
}

export function parseIdParam(value: string): number | null {
  if (!/^\d{1,12}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
