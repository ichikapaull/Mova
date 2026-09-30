import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VideoPlayer } from "@/components/player/video-player";
import { getWatchState } from "@/server/repositories/history";
import { getMediaWithSource } from "@/server/repositories/media";
import { getPlaybackContext } from "@/server/repositories/playback";
import { getSettings } from "@/server/repositories/settings";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ list?: string; t?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const row = getMediaWithSource(Number((await params).id));
  return { title: row?.media.displayTitle ?? "Player" };
}

export default async function WatchPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  const { list, t } = await searchParams;
  const row = Number.isSafeInteger(id) ? getMediaWithSource(id) : null;
  if (!row || row.media.status === "removed") notFound();

  const settings = getSettings();
  const history = getWatchState(id);
  const explicitStart = t != null && /^\d+$/.test(t) ? Number(t) : null;
  const resumeAt =
    settings.resumePlayback && history && !history.completed && history.positionSec > 10 ? history.positionSec : null;

  return (
    <VideoPlayer
      key={id}
      media={{
        id,
        title: row.media.displayTitle,
        durationSec: row.media.durationSec,
        extension: row.media.extension,
        videoCodec: row.media.videoCodec,
        audioCodec: row.media.audioCodec,
        width: row.media.width,
        version: Math.floor(row.media.fileModifiedAt / 1000),
      }}
      context={getPlaybackContext(id, list)}
      resumeAt={resumeAt}
      startAt={explicitStart}
      autoplayNext={settings.autoplayNextEpisode}
      countdownSec={settings.autoplayCountdownSec}
    />
  );
}
