import { jsonError, parseIdParam } from "@/server/http-file";
import { getMediaDetail } from "@/server/repositories/media";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseIdParam((await params).id);
  if (!id) return jsonError("Invalid media id.", 400);
  const detail = getMediaDetail(id);
  if (!detail) return jsonError("Video not found.", 404);
  return Response.json(detail);
}
