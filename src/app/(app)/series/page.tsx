import { TvIcon } from "lucide-react";
import type { Metadata } from "next";
import { SeriesCard } from "@/components/media/shelf-cards";
import { NewSeriesButton } from "@/components/organize/series-view";
import { PageContainer, PageHeader } from "@/components/page-header";
import { listSeries } from "@/server/repositories/series";

export const metadata: Metadata = { title: "Series" };

export default function SeriesIndexPage() {
  const series = listSeries();
  return (
    <PageContainer>
      <PageHeader title="Series" description="Episodes grouped in order, with automatic next-episode playback." actions={<NewSeriesButton />} />
      {series.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <TvIcon className="size-9 text-subtle-foreground" strokeWidth={1.5} />
          <p className="font-medium">No series yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Select episodes in the library (Shift/Ctrl-click) and choose “Series”, or create one here and add episodes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-4 gap-y-6">
          {series.map((s) => (
            <SeriesCard key={s.id} series={s} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
