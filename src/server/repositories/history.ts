import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/server/db";

const wh = schema.watchHistory;

export type ProgressUpdate = {
  positionSec: number;
  durationSec: number | null;
  /** First report of a playback session: increments the play count. */
  sessionStart?: boolean;
  /** Player reached the end. */
  ended?: boolean;
};

/** True when the position counts as "finished watching". */
export function isCompletedPosition(positionSec: number, durationSec: number | null, threshold: number): boolean {
  if (!durationSec || durationSec <= 0) return false;
  // Very short clips: treat the last 3 seconds as the end too.
  return positionSec / durationSec >= threshold || durationSec - positionSec <= Math.min(3, durationSec * 0.1);
}

export function recordProgress(mediaId: number, update: ProgressUpdate, completedThreshold: number, now = Date.now()) {
  const db = getDb();
  const existing = db.select().from(wh).where(eq(wh.mediaId, mediaId)).get();
  const positionSec = Math.max(0, update.positionSec);
  const durationSec = update.durationSec && update.durationSec > 0 ? update.durationSec : (existing?.durationSec ?? null);
  const reachedEnd = update.ended || isCompletedPosition(positionSec, durationSec, completedThreshold);
  // Once completed, a video stays completed until the user explicitly rewatches past the start.
  const completed = reachedEnd || (existing?.completed === true && positionSec < 5);
  const playCount = (existing?.playCount ?? 0) + (update.sessionStart ? 1 : 0);

  const values = {
    mediaId,
    // Completed videos restart from the beginning next time.
    positionSec: reachedEnd ? 0 : positionSec,
    durationSec,
    completed,
    playCount,
    lastWatchedAt: now,
    completedAt: reachedEnd ? now : (existing?.completedAt ?? null),
  };
  db.insert(wh)
    .values(values)
    .onConflictDoUpdate({ target: wh.mediaId, set: values })
    .run();
  return values;
}

export function getWatchState(mediaId: number) {
  return getDb().select().from(wh).where(eq(wh.mediaId, mediaId)).get() ?? null;
}

export function setWatched(mediaIds: number[], watched: boolean, now = Date.now()): void {
  if (mediaIds.length === 0) return;
  const db = getDb();
  if (!watched) {
    db.delete(wh).where(inArray(wh.mediaId, mediaIds)).run();
    return;
  }
  db.transaction((tx) => {
    for (const mediaId of mediaIds) {
      const existing = tx.select().from(wh).where(eq(wh.mediaId, mediaId)).get();
      const values = {
        mediaId,
        positionSec: 0,
        durationSec: existing?.durationSec ?? null,
        completed: true,
        playCount: Math.max(existing?.playCount ?? 0, 1),
        lastWatchedAt: existing?.lastWatchedAt ?? now,
        completedAt: now,
      };
      tx.insert(wh).values(values).onConflictDoUpdate({ target: wh.mediaId, set: values }).run();
    }
  });
}
