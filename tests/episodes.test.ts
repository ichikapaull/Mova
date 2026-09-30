import { describe, expect, it } from "vitest";
import { parseEpisodeFromFilename, titleFromFilename } from "@/lib/episode-parser";
import { compareByEpisodeNumber, findAdjacentEpisodes, positionsByEpisodeNumber, sortEpisodes } from "@/lib/series-order";

describe("parseEpisodeFromFilename", () => {
  it.each([
    ["Naruto.S01E02.1080p.mkv", 1, 2],
    ["show s2e10.mp4", 2, 10],
    ["Show 1x05.avi", 1, 5],
    ["Season 3 Episode 7.mkv", 3, 7],
  ])("%s → S%s E%s", (name, season, episode) => {
    expect(parseEpisodeFromFilename(name)).toEqual({ seasonNumber: season, episodeNumber: episode });
  });

  it.each([
    ["Naruto Episode 23.mp4", 23],
    ["[SubsPlease] Frieren - 12 (1080p) [ABCD1234].mkv", 12],
    ["One Piece - 1071v2 [1080p].mkv", 1071],
    ["Bleach EP05.mkv", 5],
    ["Dragon Ball [042].mkv", 42],
    ["Kurtlar Vadisi Bölüm 97.mp4", 97],
    ["Naruto 023.mkv", 23],
  ])("%s → E%s", (name, episode) => {
    expect(parseEpisodeFromFilename(name).episodeNumber).toBe(episode);
  });

  it("ignores years and resolutions", () => {
    expect(parseEpisodeFromFilename("Movie (2019) 1080p.mkv")).toEqual({ seasonNumber: null, episodeNumber: null });
  });
});

describe("titleFromFilename", () => {
  it("drops extension and separators", () => {
    expect(titleFromFilename("my_great.video.mp4")).toBe("my great video");
  });
});

const ep = (mediaId: number, seasonNumber: number | null, episodeNumber: number | null, position: number, title = `Ep ${mediaId}`) => ({
  mediaId,
  seasonNumber,
  episodeNumber,
  position,
  title,
});

describe("series ordering", () => {
  it("orders by season, then explicit position", () => {
    const sorted = sortEpisodes([ep(1, 2, 1, 0), ep(2, 1, 2, 1), ep(3, 1, 1, 0), ep(4, null, null, 0)]);
    expect(sorted.map((e) => e.mediaId)).toEqual([4, 3, 2, 1]);
  });

  it("derives positions from episode numbers with natural title fallback", () => {
    const positions = positionsByEpisodeNumber([
      ep(1, 1, 10, 0),
      ep(2, 1, 2, 1),
      ep(3, 1, null, 2, "Extra 10"),
      ep(4, 1, null, 3, "Extra 2"),
      ep(5, 1, 1.5, 4),
    ]);
    expect([...positions.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual([5, 2, 1, 4, 3]);
  });

  it("episode-number comparison puts unnumbered episodes last", () => {
    expect(compareByEpisodeNumber(ep(1, 1, null, 0), ep(2, 1, 99, 0))).toBeGreaterThan(0);
  });

  it("finds previous and next episodes across seasons", () => {
    const episodes = [ep(10, 1, 1, 0), ep(11, 1, 2, 1), ep(20, 2, 1, 0)];
    expect(findAdjacentEpisodes(episodes, 11)).toMatchObject({ previous: { mediaId: 10 }, next: { mediaId: 20 }, index: 1 });
    expect(findAdjacentEpisodes(episodes, 10).previous).toBeNull();
    expect(findAdjacentEpisodes(episodes, 20).next).toBeNull();
    expect(findAdjacentEpisodes(episodes, 99).index).toBe(-1);
  });
});
