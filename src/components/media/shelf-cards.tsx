import { FolderHeartIcon, TvIcon } from "lucide-react";
import Link from "next/link";
import { FallbackPoster } from "@/components/media/media-thumbnail";
import { pluralize } from "@/lib/format";

function Thumb({ mediaId, alt }: { mediaId: number; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- local API image
  return <img src={`/api/media/${mediaId}/thumbnail`} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />;
}

export function SeriesCard({
  series,
}: {
  series: { id: number; title: string; episodeCount: number; watchedCount: number; posterMediaId: number | null };
}) {
  const progress = series.episodeCount ? series.watchedCount / series.episodeCount : 0;
  return (
    <Link href={`/series/${series.id}`} className="group/card flex flex-col gap-2.5 outline-none">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-surface ring-1 ring-white/[0.06] transition-[transform,box-shadow] duration-200 group-hover/card:scale-[1.03] group-hover/card:shadow-2xl group-hover/card:shadow-black/70 group-focus-visible/card:ring-2 group-focus-visible/card:ring-foreground/70">
        {series.posterMediaId ? <Thumb mediaId={series.posterMediaId} alt="" /> : <FallbackPoster id={series.id * 7} title={series.title} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <span className="line-clamp-2 text-[15px] leading-tight font-semibold text-white">{series.title}</span>
          <TvIcon className="size-4 shrink-0 text-white/60" />
        </div>
        {progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
            <div className="h-full bg-brand" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
      <p className="px-0.5 text-xs text-muted-foreground">
        {pluralize(series.episodeCount, "episode")}
        {series.watchedCount > 0 && ` · ${series.watchedCount} watched`}
      </p>
    </Link>
  );
}

export function CollectionCard({ collection }: { collection: { id: number; name: string; count: number; coverMediaIds: number[] } }) {
  const covers = collection.coverMediaIds.slice(0, 4);
  return (
    <Link href={`/collections/${collection.id}`} className="group/card flex flex-col gap-2.5 outline-none">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-surface ring-1 ring-white/[0.06] transition-[transform,box-shadow] duration-200 group-hover/card:scale-[1.03] group-hover/card:shadow-2xl group-hover/card:shadow-black/70 group-focus-visible/card:ring-2 group-focus-visible/card:ring-foreground/70">
        {covers.length >= 4 ? (
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-black">
            {covers.map((id) => (
              <div key={id} className="relative overflow-hidden">
                <Thumb mediaId={id} alt="" />
              </div>
            ))}
          </div>
        ) : covers[0] ? (
          <Thumb mediaId={covers[0]} alt="" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1b1b1b] to-[#0f0f0f]">
            <FolderHeartIcon className="size-7 text-white/20" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <span className="absolute inset-x-3 bottom-3 line-clamp-2 text-[15px] leading-tight font-semibold text-white">{collection.name}</span>
      </div>
      <p className="px-0.5 text-xs text-muted-foreground">{pluralize(collection.count, "video")}</p>
    </Link>
  );
}
