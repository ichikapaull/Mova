import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeriesView } from "@/components/organize/series-view";
import { PageContainer } from "@/components/page-header";
import { getSeries, getSeriesResumeTarget } from "@/server/repositories/series";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getSeries(Number((await params).id))?.title ?? "Series" };
}

export default async function SeriesPage({ params }: Props) {
  const id = Number((await params).id);
  const series = getSeries(id);
  if (!series) notFound();
  return (
    <PageContainer className="max-w-6xl">
      <SeriesView series={series} resumeId={getSeriesResumeTarget(id)} />
    </PageContainer>
  );
}
