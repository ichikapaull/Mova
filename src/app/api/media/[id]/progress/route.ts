import { z } from "zod";
import { jsonError, parseIdParam } from "@/server/http-file";
import { recordProgress } from "@/server/repositories/history";
import { mediaExists } from "@/server/repositories/playback";
import { getSettings } from "@/server/repositories/settings";

const progressSchema = z.object({
  positionSec: z.number().finite().min(0).max(1e7),
  durationSec: z.number().finite().min(0).max(1e7).nullable().optional(),
  sessionStart: z.boolean().optional(),
  ended: z.boolean().optional(),
});

/** Saves playback position. Accepts sendBeacon payloads (text/plain JSON) too. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseIdParam((await params).id);
  if (!id) return jsonError("Invalid media id.", 400);
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }
  const parsed = progressSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid progress payload.", 400);
  if (!mediaExists(id)) return jsonError("Video not found.", 404);
  const result = recordProgress(
    id,
    { ...parsed.data, durationSec: parsed.data.durationSec ?? null },
    getSettings().completedThreshold,
  );
  return Response.json({ completed: result.completed, positionSec: result.positionSec });
}
