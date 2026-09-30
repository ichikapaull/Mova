"use client";

import { FilmIcon } from "lucide-react";
import { useState } from "react";
import { thumbnailUrl } from "@/lib/client/media-urls";
import type { MediaListItem } from "@/lib/library-query";
import { cn } from "@/lib/utils";

/** Deterministic, muted hue per video so fallback posters don't all look identical. */
function posterHue(id: number): number {
  return (id * 47) % 360;
}

export function FallbackPoster({ id, title, extension, className }: { id: number; title: string; extension?: string; className?: string }) {
  const hue = posterHue(id);
  return (
    <div
      className={cn("absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden", className)}
      style={{
        background: `radial-gradient(120% 90% at 20% 10%, hsl(${hue} 22% 16%) 0%, hsl(${hue} 14% 9%) 55%, #0c0c0c 100%)`,
      }}
      aria-hidden
    >
      <FilmIcon className="size-6 text-white/20" strokeWidth={1.5} />
      <span className="line-clamp-2 max-w-[80%] text-center text-[11px] font-medium text-white/30">{title}</span>
      {extension && <span className="absolute top-2 right-2 font-mono text-[9px] uppercase tracking-wider text-white/25">{extension}</span>}
    </div>
  );
}

export function MediaThumbnail({
  item,
  className,
  sizes,
  eager,
}: {
  item: Pick<MediaListItem, "id" | "title" | "extension" | "version" | "thumbnailStatus">;
  className?: string;
  sizes?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = item.thumbnailStatus === "ready" && !failed;
  return (
    <>
      <FallbackPoster id={item.id} title={item.title} extension={item.extension} className={cn(showImage && loaded && "opacity-0")} />
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element -- served by our own API, not optimizable by next/image
        <img
          src={thumbnailUrl(item)}
          alt=""
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
            className,
          )}
        />
      )}
    </>
  );
}
