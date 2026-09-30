import { InfoIcon, PlayIcon } from "lucide-react";
import Link from "next/link";
import { MediaThumbnail } from "@/components/media/media-thumbnail";
import { Button } from "@/components/ui/button";
import { watchHref } from "@/lib/client/media-urls";
import { formatDuration, formatResolution, formatRuntime } from "@/lib/format";
import type { MediaListItem } from "@/lib/library-query";

export function HomeHero({ item, eyebrow }: { item: MediaListItem; eyebrow: string }) {
  const resume = !item.completed && item.progressSec && item.progressSec > 5 ? item.progressSec : null;
  const progress = resume && item.durationSec ? resume / item.durationSec : 0;
  const meta = [formatRuntime(item.durationSec), formatResolution(item.width, item.height), item.categoryName, item.extension.toUpperCase()].filter(Boolean);

  return (
    <section className="relative mx-6 mt-2 overflow-hidden rounded-2xl border border-border bg-surface lg:mx-10">
      <div className="absolute inset-y-0 right-0 w-full md:w-[68%]">
        <div className="relative size-full">
          <MediaThumbnail item={item} eager />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/85 to-transparent md:via-surface/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
      </div>
      <div className="relative flex min-h-[300px] flex-col justify-end gap-4 p-7 md:min-h-[360px] md:max-w-[55%] lg:p-10">
        <p className="text-xs font-medium tracking-[0.14em] text-brand uppercase">{eyebrow}</p>
        <h1 className="line-clamp-2 text-3xl font-semibold tracking-tight text-balance lg:text-[40px] lg:leading-[1.1]">{item.title}</h1>
        {meta.length > 0 && <p className="text-sm text-muted-foreground">{meta.join("  ·  ")}</p>}
        {resume && (
          <div className="flex max-w-xs items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <div className="h-full bg-brand" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDuration(resume)} / {formatDuration(item.durationSec)}
            </span>
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-2.5">
          <Button asChild size="lg" className="gap-2.5">
            <Link href={watchHref(item.id)}>
              <PlayIcon className="fill-current" />
              {resume ? `Resume from ${formatDuration(resume)}` : "Play"}
            </Link>
          </Button>
          <Button asChild size="lg" variant="glass">
            <Link href={`/media/${item.id}`}>
              <InfoIcon /> Details
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
