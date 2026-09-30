"use client";

import { useEffect, useRef, useState } from "react";
import { previewUrl } from "@/lib/client/media-urls";
import { cn } from "@/lib/utils";

/** Muted looping preview that fades in once frames are actually playing. */
export function PreviewVideo({ id, version, className }: { id: number; version: number; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    return () => {
      // Abort the download right away when the card is left.
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, []);

  return (
    <video
      ref={ref}
      src={previewUrl({ id, version })}
      muted
      loop
      autoPlay
      playsInline
      disablePictureInPicture
      preload="auto"
      onPlaying={() => setPlaying(true)}
      className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", playing ? "opacity-100" : "opacity-0", className)}
    />
  );
}
