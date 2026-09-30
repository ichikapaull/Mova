"use client";

import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  GaugeIcon,
  Loader2Icon,
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PictureInPicture2Icon,
  PlayIcon,
  RotateCcwIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useGoBack } from "@/components/back-link";
import { SeekBar } from "@/components/player/seek-bar";
import { useProgressReporter } from "@/components/player/use-progress-reporter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Slider } from "@/components/ui/slider";
import { Tooltip } from "@/components/ui/tooltip";
import { streamUrl, thumbnailUrl, watchHref } from "@/lib/client/media-urls";
import { callAction } from "@/lib/client/run-action";
import { formatDuration } from "@/lib/format";
import { newShuffleSeed, shuffleListParam } from "@/lib/shuffle";
import { clamp, cn } from "@/lib/utils";
import { openExternallyAction, showInFolderAction } from "@/server/actions/media";
import type { PlaybackContext } from "@/server/repositories/playback";

export type PlayerMedia = {
  id: number;
  title: string;
  durationSec: number | null;
  extension: string;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  version: number;
};

type Props = {
  media: PlayerMedia;
  context: PlaybackContext;
  /** Saved position to offer ("Continue from 24:31?"). */
  resumeAt: number | null;
  /** Explicit start time (?t=), skips the prompt. */
  startAt: number | null;
  autoplayNext: boolean;
  countdownSec: number;
};

const subscribeNever = () => () => {};
/** PiP support is only known in the browser; the server renders without the button. */
function usePictureInPictureSupported(): boolean {
  return useSyncExternalStore(subscribeNever, () => document.pictureInPictureEnabled, () => false);
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const HIDE_CONTROLS_AFTER_MS = 2800;
const VOLUME_KEY = "mova-player-volume";

function readStoredVolume(): { volume: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { volume?: number; muted?: boolean };
      return { volume: clamp(Number(parsed.volume ?? 1), 0, 1), muted: Boolean(parsed.muted) };
    }
  } catch {
    // Storage unavailable.
  }
  return { volume: 1, muted: false };
}

function describeMediaError(error: MediaError | null, media: PlayerMedia): string {
  const codec = [media.videoCodec, media.audioCodec].filter(Boolean).join(" / ");
  switch (error?.code) {
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
    case MediaError.MEDIA_ERR_DECODE:
      return `Your browser can't play this file${codec ? ` (${media.extension.toUpperCase()} · ${codec})` : ""}. Open it in your system player instead.`;
    case MediaError.MEDIA_ERR_NETWORK:
      return "The video stopped loading. The file may have been moved or the disk disconnected.";
    default:
      return "The video could not be played.";
  }
}

export function VideoPlayer({ media, context, resumeAt, startAt, autoplayNext, countdownSec }: Props) {
  const router = useRouter();
  const goBack = useGoBack(`/media/${media.id}`);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const getVideo = useCallback(() => videoRef.current, []);
  const { reportNow, onTimeUpdate } = useProgressReporter(media.id, getVideo);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startAt ?? 0);
  const [duration, setDuration] = useState(media.durationSec ?? 0);
  const [buffered, setBuffered] = useState<Array<[number, number]>>([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [waiting, setWaiting] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [osd, setOsd] = useState<{ text: string; key: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [resumePrompt, setResumePrompt] = useState(resumeAt != null && startAt == null);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const pipSupported = usePictureInPictureSupported();
  const hideTimer = useRef(0);
  const clickTimer = useRef(0);
  const osdTimer = useRef(0);

  const next = context.next;
  const previous = context.previous;
  const listOption = { list: context.listParam };
  const shuffling = context.kind === "shuffle";
  // Folder order is only a fallback for manual skipping; it never auto-advances.
  const autoAdvance = autoplayNext && context.kind !== "folder";

  // ---------------------------------------------------------------- helpers
  const flash = useCallback((text: string) => {
    window.clearTimeout(osdTimer.current);
    setOsd({ text, key: Date.now() });
    osdTimer.current = window.setTimeout(() => setOsd(null), 700);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), HIDE_CONTROLS_AFTER_MS);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || error) return;
    if (resumePrompt) return;
    if (video.paused || video.ended) void video.play().catch(() => undefined);
    else video.pause();
  }, [error, resumePrompt]);

  const seekTo = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      const target = clamp(time, 0, Number.isFinite(video.duration) ? video.duration : (media.durationSec ?? time));
      video.currentTime = target;
      setCurrentTime(target);
      setEnded(false);
      setCountdown(null);
    },
    [media.durationSec],
  );

  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      seekTo(video.currentTime + delta);
      flash(`${delta > 0 ? "+" : "−"}${Math.abs(delta)}s`);
    },
    [flash, seekTo],
  );

  const applyVolume = useCallback(
    (value: number, mute?: boolean) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = clamp(value, 0, 1);
      video.muted = mute ?? (value === 0 ? true : false);
    },
    [],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen({ navigationUI: "hide" });
    } catch {
      flash("Fullscreen unavailable");
    }
  }, [flash]);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      flash("Picture-in-Picture unavailable");
    }
  }, [flash]);

  const goTo = useCallback(
    (id: number) => {
      reportNow({}, true);
      router.replace(watchHref(id, listOption));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportNow, router, context.listParam],
  );

  /** Swaps the playback context in place; the same video keeps playing. */
  const toggleShuffle = useCallback(() => {
    router.replace(watchHref(media.id, { list: shuffling ? null : shuffleListParam(newShuffleSeed()) }), { scroll: false });
    flash(shuffling ? "Shuffle off" : "Shuffle on");
  }, [router, media.id, shuffling, flash]);

  // ---------------------------------------------------------------- setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const stored = readStoredVolume();
    // State follows via the `volumechange` event.
    video.volume = stored.volume;
    video.muted = stored.muted;
    // The source is attached only after hydration: a server-rendered `src` would start
    // loading before React listens, and early `error`/`loadedmetadata` events would be lost.
    video.src = streamUrl(media.id);
    if (startAt != null) video.currentTime = startAt;
    if (!resumePrompt) void video.play().catch(() => setPlaying(false));
    // Only on mount / media change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Auto-hide controls while playing; paused, menus and scrubbing keep them pinned.
  const controlsPinned = !playing || menuOpen || scrubbing;
  useEffect(() => {
    window.clearTimeout(hideTimer.current);
    if (!controlsPinned) hideTimer.current = window.setTimeout(() => setControlsVisible(false), HIDE_CONTROLS_AFTER_MS);
    return () => window.clearTimeout(hideTimer.current);
  }, [controlsPinned]);

  // Media Session: hardware media keys / OS media overlay.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: media.title,
      artist: context.label ?? "Mova",
      artwork: [{ src: thumbnailUrl(media), sizes: "640x360", type: "image/jpeg" }],
    });
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ["play", () => void videoRef.current?.play()],
      ["pause", () => videoRef.current?.pause()],
      ["seekbackward", () => seekBy(-10)],
      ["seekforward", () => seekBy(10)],
      ["previoustrack", previous ? () => goTo(previous.id) : null],
      ["nexttrack", next ? () => goTo(next.id) : null],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported action.
      }
    }
  }, [media, context.label, next, previous, seekBy, goTo]);

  // Next-episode countdown.
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      if (next) goTo(next.id);
      return;
    }
    const timer = window.setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, next, goTo]);

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [role=menu]")) return;
      const video = videoRef.current;
      if (!video) return;

      if (resumePrompt) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          resume(true);
        } else if (event.key === "Escape" || event.key === "Backspace") {
          event.preventDefault();
          resume(false);
        }
        return;
      }
      if (countdown != null && event.key === "Escape") {
        event.preventDefault();
        setCountdown(null);
        return;
      }

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      let handled = true;
      switch (key) {
        case " ":
        case "k":
          // Space on a focused button would click it as well.
          if (target instanceof HTMLButtonElement) target.blur();
          togglePlay();
          break;
        case "ArrowLeft":
          seekBy(-5);
          break;
        case "ArrowRight":
          seekBy(5);
          break;
        case "j":
          seekBy(-10);
          break;
        case "l":
          seekBy(10);
          break;
        case "ArrowUp": {
          const value = clamp(video.volume + 0.05, 0, 1);
          applyVolume(value, false);
          flash(`Volume ${Math.round(value * 100)}%`);
          break;
        }
        case "ArrowDown": {
          const value = clamp(video.volume - 0.05, 0, 1);
          applyVolume(value, value === 0);
          flash(`Volume ${Math.round(value * 100)}%`);
          break;
        }
        case "m":
          video.muted = !video.muted;
          flash(video.muted ? "Muted" : `Volume ${Math.round(video.volume * 100)}%`);
          break;
        case "f":
          void toggleFullscreen();
          break;
        case "p":
          if (event.shiftKey && previous) goTo(previous.id);
          else if (!event.shiftKey) void togglePip();
          break;
        case "n":
          if (next) goTo(next.id);
          break;
        case "s":
          toggleShuffle();
          break;
        case "Home":
          seekTo(0);
          break;
        case "End":
          seekTo(video.duration - 1);
          break;
        case ",":
        case "<": {
          const index = Math.max(0, SPEEDS.indexOf(video.playbackRate) - 1);
          video.playbackRate = SPEEDS[index] ?? 1;
          flash(`${video.playbackRate}×`);
          break;
        }
        case ".":
        case ">": {
          const index = Math.min(SPEEDS.length - 1, SPEEDS.indexOf(video.playbackRate) + 1);
          video.playbackRate = SPEEDS[index] ?? 1;
          flash(`${video.playbackRate}×`);
          break;
        }
        default:
          if (/^[0-9]$/.test(key) && Number.isFinite(video.duration)) {
            seekTo((Number(key) / 10) * video.duration);
          } else {
            handled = false;
          }
      }
      if (handled) {
        event.preventDefault();
        showControls();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // ---------------------------------------------------------------- actions
  function resume(fromSaved: boolean) {
    const video = videoRef.current;
    setResumePrompt(false);
    if (!video) return;
    if (fromSaved && resumeAt != null) video.currentTime = resumeAt;
    else video.currentTime = 0;
    void video.play().catch(() => undefined);
  }

  const handleSurfaceClick = () => {
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(togglePlay, 180);
  };
  const handleSurfaceDoubleClick = () => {
    window.clearTimeout(clickTimer.current);
    void toggleFullscreen();
  };

  const handleVideoError = async () => {
    const video = videoRef.current;
    let message = describeMediaError(video?.error ?? null, media);
    // Ask the server for a precise reason (missing file, offline disk…).
    try {
      const response = await fetch(streamUrl(media.id), { method: "GET", headers: { Range: "bytes=0-0" } });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (body?.error) message = body.error;
      }
    } catch {
      message = "Mova's server is not reachable.";
    }
    setError(message);
    setWaiting(false);
  };

  const VolumeIcon = muted || volume === 0 ? VolumeXIcon : volume < 0.5 ? Volume1Icon : Volume2Icon;
  const overlayVisible = controlsVisible || controlsPinned || resumePrompt || ended || Boolean(error);

  return (
    <div
      ref={containerRef}
      className={cn("fixed inset-0 bg-black text-white select-none", !overlayVisible && "cursor-none")}
      onPointerMove={showControls}
      onPointerDown={showControls}
    >
      <video
        ref={videoRef}
        preload="auto"
        playsInline
        className="absolute inset-0 size-full"
        onClick={handleSurfaceClick}
        onDoubleClick={handleSurfaceDoubleClick}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
        }}
        onPause={() => {
          setPlaying(false);
          reportNow();
        }}
        onPlaying={() => {
          setWaiting(false);
          reportNow();
        }}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onSeeked={() => reportNow()}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (Number.isFinite(video.duration)) setDuration(video.duration);
          // Audio decoded but no video frames: codec (e.g. HEVC) unsupported by this browser.
          if (video.videoWidth === 0 && (media.width ?? 0) > 0) setAudioOnly(true);
        }}
        onDurationChange={(event) => Number.isFinite(event.currentTarget.duration) && setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => {
          if (!scrubbing) setCurrentTime(event.currentTarget.currentTime);
          onTimeUpdate();
        }}
        onProgress={(event) => {
          const ranges = event.currentTarget.buffered;
          const list: Array<[number, number]> = [];
          for (let i = 0; i < ranges.length; i++) list.push([ranges.start(i), ranges.end(i)]);
          setBuffered(list);
        }}
        onVolumeChange={(event) => {
          const video = event.currentTarget;
          setVolume(video.volume);
          setMuted(video.muted);
          try {
            localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume: video.volume, muted: video.muted }));
          } catch {
            // ignore
          }
        }}
        onRateChange={(event) => setRate(event.currentTarget.playbackRate)}
        onEnded={() => {
          setPlaying(false);
          setEnded(true);
          reportNow({ ended: true });
          if (next && autoAdvance) setCountdown(countdownSec);
        }}
        onError={handleVideoError}
      />

      {/* Buffering spinner */}
      {waiting && !error && !resumePrompt && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2Icon className="size-10 animate-spin text-white/70" />
        </div>
      )}

      {/* On-screen feedback for keyboard actions */}
      {osd && (
        <div key={osd.key} className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-fade-in rounded-xl bg-black/60 px-5 py-3 text-lg font-medium tabular-nums backdrop-blur-md">{osd.text}</div>
        </div>
      )}

      {/* Top bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 flex items-start gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pt-4 pb-16 transition-opacity duration-200 sm:px-6",
          overlayVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Tooltip content="Back">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={goBack} aria-label="Back">
            <ArrowLeftIcon className="size-5" />
          </Button>
        </Tooltip>
        <div className="min-w-0 pt-1">
          <h1 className="truncate text-base font-semibold sm:text-lg">{media.title}</h1>
          {context.label && (
            <p className="truncate text-sm text-white/60">
              {context.href ? (
                <Link href={context.href} className="hover:text-white">
                  {context.label}
                </Link>
              ) : (
                context.label
              )}
            </p>
          )}
        </div>
      </div>

      {audioOnly && !error && (
        <div className="absolute top-20 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-black/75 px-4 py-2.5 text-sm backdrop-blur-md">
          <AlertTriangleIcon className="size-4 shrink-0 text-warning" />
          <span>Your browser can&apos;t decode this video codec ({media.videoCodec}); only audio is playing.</span>
          <Button size="sm" variant="glass" onClick={() => void callAction(openExternallyAction(media.id))}>
            <ExternalLinkIcon /> System player
          </Button>
        </div>
      )}

      {/* Bottom controls */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pt-20 pb-4 transition-opacity duration-200 sm:px-6",
          overlayVisible && !resumePrompt ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <SeekBar currentTime={currentTime} duration={duration} buffered={buffered} onSeek={seekTo} onScrubChange={setScrubbing} />
        <div className="mt-2 flex items-center gap-1 sm:gap-2">
          {previous && (
            <Tooltip content={`Previous${previous.label ? ` · ${previous.label}` : ""}`} shortcut="⇧P">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => goTo(previous.id)} aria-label="Previous video">
                <SkipBackIcon className="size-5 fill-current" />
              </Button>
            </Tooltip>
          )}
          <Tooltip content={playing ? "Pause" : "Play"} shortcut="Space">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <PauseIcon className="size-6 fill-current" /> : <PlayIcon className="size-6 fill-current" />}
            </Button>
          </Tooltip>
          {next && (
            <Tooltip content={`Next${next.label ? ` · ${next.label}` : ""}`} shortcut="N">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => goTo(next.id)} aria-label="Next video">
                <SkipForwardIcon className="size-5 fill-current" />
              </Button>
            </Tooltip>
          )}
          <Tooltip content={shuffling ? "Shuffle on" : "Shuffle"} shortcut="S">
            <Button
              variant="ghost"
              size="icon"
              className={cn("text-white hover:bg-white/10 hover:text-white", shuffling && "text-brand hover:text-brand")}
              onClick={toggleShuffle}
              aria-label="Shuffle"
              aria-pressed={shuffling}
            >
              <ShuffleIcon className="size-5" />
            </Button>
          </Tooltip>

          <div className="group/volume flex items-center">
            <Tooltip content={muted ? "Unmute" : "Mute"} shortcut="M">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.muted = !video.muted;
                }}
              >
                <VolumeIcon className="size-5" />
              </Button>
            </Tooltip>
            <div className="w-0 overflow-hidden transition-[width] duration-200 group-hover/volume:w-24 focus-within:w-24">
              <Slider
                aria-label="Volume"
                className="w-20 px-1"
                min={0}
                max={1}
                step={0.01}
                value={[muted ? 0 : volume]}
                onValueChange={([value]) => applyVolume(value ?? 0)}
              />
            </div>
          </div>

          <span className="ml-1 font-mono text-[13px] text-white/85 tabular-nums">
            {formatDuration(currentTime)} <span className="text-white/45">/ {formatDuration(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <DropdownMenu onOpenChange={setMenuOpen}>
              <Tooltip content="Playback speed">
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-white hover:bg-white/10 hover:text-white" aria-label="Playback speed">
                    <GaugeIcon className="size-4" />
                    <span className="font-mono text-xs tabular-nums">{rate}×</span>
                  </Button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="end" side="top" onCloseAutoFocus={(event) => event.preventDefault()}>
                <DropdownMenuLabel>Speed</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={String(rate)}
                  onValueChange={(value) => {
                    if (videoRef.current) videoRef.current.playbackRate = Number(value);
                  }}
                >
                  {SPEEDS.map((speed) => (
                    <DropdownMenuRadioItem key={speed} value={String(speed)}>
                      {speed === 1 ? "Normal" : `${speed}×`}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {pipSupported && (
              <Tooltip content="Picture in picture" shortcut="P">
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={togglePip} aria-label="Picture in picture">
                  <PictureInPicture2Icon className="size-5" />
                </Button>
              </Tooltip>
            )}
            <Tooltip content={fullscreen ? "Exit fullscreen" : "Fullscreen"} shortcut="F">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
                {fullscreen ? <MinimizeIcon className="size-5" /> : <MaximizeIcon className="size-5" />}
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Resume prompt */}
      {resumePrompt && resumeAt != null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="flex w-[min(92vw,400px)] animate-scale-in flex-col gap-5 rounded-2xl border border-white/10 bg-[#141414]/95 p-6 shadow-2xl">
            <div>
              <p className="text-lg font-semibold">Continue from {formatDuration(resumeAt)}?</p>
              {duration > 0 && (
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full bg-brand" style={{ width: `${(resumeAt / duration) * 100}%` }} />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button autoFocus className="flex-1" onClick={() => resume(true)}>
                <PlayIcon className="fill-current" /> Resume
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => resume(false)}>
                <RotateCcwIcon /> Start over
              </Button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-xs text-white/40">
              <Kbd>Enter</Kbd> resume · <Kbd>Esc</Kbd> start over
            </p>
          </div>
        </div>
      )}

      {/* End screen / next-episode countdown */}
      {ended && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex w-[min(92vw,440px)] animate-scale-in flex-col gap-5 rounded-2xl border border-white/10 bg-[#141414]/95 p-6 shadow-2xl">
            {next ? (
              <>
                <p className="text-sm text-white/60">{countdown != null ? `Next ${context.kind === "series" ? "episode" : "video"} in ${countdown} ${countdown === 1 ? "second" : "seconds"}` : "Up next"}</p>
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local API image */}
                  <img src={`/api/media/${next.id}/thumbnail`} alt="" className="aspect-video w-32 rounded-md bg-white/5 object-cover" />
                  <div className="min-w-0">
                    {next.label && <p className="text-xs text-white/50">{next.label}</p>}
                    <p className="line-clamp-2 font-medium">{next.title}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button autoFocus className="flex-1" onClick={() => goTo(next.id)}>
                    <PlayIcon className="fill-current" /> Play now
                  </Button>
                  {countdown != null ? (
                    <Button variant="secondary" className="flex-1" onClick={() => setCountdown(null)}>
                      Cancel
                    </Button>
                  ) : (
                    <Button variant="secondary" className="flex-1" onClick={() => seekTo(0)}>
                      <RotateCcwIcon /> Replay
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">Finished</p>
                <div className="flex gap-2">
                  <Button
                    autoFocus
                    className="flex-1"
                    onClick={() => {
                      seekTo(0);
                      void videoRef.current?.play();
                    }}
                  >
                    <RotateCcwIcon /> Replay
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={goBack}>
                    Back
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error screen */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex w-[min(92vw,460px)] flex-col items-center gap-4 text-center">
            <AlertTriangleIcon className="size-10 text-warning" strokeWidth={1.5} />
            <p className="text-lg font-semibold">Can&apos;t play this video</p>
            <p className="text-sm text-white/65">{error}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button onClick={() => void callAction(openExternallyAction(media.id))}>
                <ExternalLinkIcon /> Open in system player
              </Button>
              <Button variant="secondary" onClick={() => void callAction(showInFolderAction(media.id))}>
                <FolderOpenIcon /> Show in folder
              </Button>
              <Button variant="ghost" className="text-white/80" onClick={goBack}>
                Back
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
