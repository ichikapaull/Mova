import { parseShuffleSeed } from "@/lib/shuffle";
import { jsonError } from "@/server/http-file";
import { listMediaItemsByIds, listShuffled } from "@/server/repositories/library";

const MAX_PICKS = 60;

/**
 * Random picks: `?seed=<base36>&limit=12` starts a new set; `?ids=1,2,3` reloads an
 * existing set (fresh thumbnails, favorites, progress) without picking new videos.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawIds = params.get("ids");
  if (rawIds != null) {
    const ids = rawIds
      .split(",")
      .filter(Boolean)
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0)
      .slice(0, MAX_PICKS);
    return Response.json({ items: listMediaItemsByIds(ids) });
  }
  const seed = parseShuffleSeed(params.get("seed"));
  if (seed == null) return jsonError("Invalid shuffle seed.", 400);
  const limit = Math.max(1, Math.min(MAX_PICKS, Number(params.get("limit")) || 12));
  return Response.json({ items: listShuffled(seed, limit) });
}
