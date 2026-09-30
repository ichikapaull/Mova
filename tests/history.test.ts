import { beforeEach, describe, expect, it } from "vitest";
import { getWatchState, isCompletedPosition, recordProgress, setWatched } from "@/server/repositories/history";
import { listContinueWatching } from "@/server/repositories/library";
import { indexSourceFiles } from "@/server/scanner";
import { applyProbeResult } from "@/server/scanner";
import { fakeProbe, insertSource, makeTempDir, setupTestDatabase } from "./helpers";

async function seedVideo() {
  const db = setupTestDatabase();
  const root = makeTempDir();
  const source = insertSource(db, root);
  const { toProbe } = indexSourceFiles(source.id, root, [{ absolutePath: `${root}/movie.mp4`, size: 100, mtimeMs: 1, birthtimeMs: null }]);
  applyProbeResult(toProbe[0]!, { ...(await fakeProbe()), durationSec: 1000 });
  return { db, id: toProbe[0]! };
}

describe("isCompletedPosition", () => {
  it("uses the threshold", () => {
    expect(isCompletedPosition(919, 1000, 0.92)).toBe(false);
    expect(isCompletedPosition(920, 1000, 0.92)).toBe(true);
  });
  it("treats the last seconds of short clips as the end", () => {
    expect(isCompletedPosition(18, 20, 0.95)).toBe(true);
  });
  it("never completes without a duration", () => {
    expect(isCompletedPosition(5000, null, 0.9)).toBe(false);
  });
});

describe("watch progress", () => {
  let id: number;
  beforeEach(async () => {
    ({ id } = await seedVideo());
  });

  it("stores the position and counts play sessions", () => {
    recordProgress(id, { positionSec: 30, durationSec: 1000, sessionStart: true }, 0.92, 1000);
    recordProgress(id, { positionSec: 1471, durationSec: 1000 }, 0.92, 2000);
    recordProgress(id, { positionSec: 60, durationSec: 1000 }, 0.92, 3000);
    expect(getWatchState(id)).toMatchObject({ positionSec: 60, playCount: 1, completed: false, lastWatchedAt: 3000 });
  });

  it("appears in Continue Watching while in progress", () => {
    recordProgress(id, { positionSec: 300, durationSec: 1000, sessionStart: true }, 0.92);
    expect(listContinueWatching(10, 0.92).map((i) => i.id)).toEqual([id]);
  });

  it("marks completed past the threshold and resets the resume position", () => {
    recordProgress(id, { positionSec: 950, durationSec: 1000, sessionStart: true }, 0.92, 5000);
    expect(getWatchState(id)).toMatchObject({ completed: true, positionSec: 0, completedAt: 5000 });
    expect(listContinueWatching(10, 0.92)).toEqual([]);
  });

  it("marks completed when the player reports the end", () => {
    recordProgress(id, { positionSec: 10, durationSec: 1000, ended: true }, 0.92);
    expect(getWatchState(id)?.completed).toBe(true);
  });

  it("a rewatch past the start clears completed again", () => {
    recordProgress(id, { positionSec: 999, durationSec: 1000, sessionStart: true }, 0.92);
    recordProgress(id, { positionSec: 2, durationSec: 1000, sessionStart: true }, 0.92);
    expect(getWatchState(id)).toMatchObject({ completed: true, playCount: 2 });
    recordProgress(id, { positionSec: 200, durationSec: 1000 }, 0.92);
    expect(getWatchState(id)).toMatchObject({ completed: false, positionSec: 200 });
  });

  it("setWatched toggles state explicitly", () => {
    setWatched([id], true);
    expect(getWatchState(id)).toMatchObject({ completed: true, playCount: 1 });
    setWatched([id], false);
    expect(getWatchState(id)).toBeNull();
  });
});
