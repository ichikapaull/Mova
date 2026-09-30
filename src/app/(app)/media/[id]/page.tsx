import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { notFound } from "next/navigation";
import { MediaDetailView } from "@/components/media/detail/media-detail-view";
import { RelatedVideos } from "@/components/media/detail/related-videos";
import { MediaRow } from "@/components/media/media-row";
import { PageContainer } from "@/components/page-header";
import { listMediaItemsByIds } from "@/server/repositories/library";
import { getMediaDetail } from "@/server/repositories/media";
import { getRelations } from "@/server/repositories/relations";
import { getSeries } from "@/server/repositories/series";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ list?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getMediaDetail(Number((await params).id))?.displayTitle ?? "Video" };
}

export default async function MediaPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  const { list } = await searchParams;
  const media = Number.isSafeInteger(id) ? getMediaDetail(id) : null;
  if (!media) notFound();
  const [listItem] = listMediaItemsByIds([id], { includeUnavailable: true });
  if (!listItem) notFound();
  const relations = getRelations(id);
  const seriesEpisodes = media.series ? (getSeries(media.series.seriesId)?.episodes ?? []) : [];

  return (
    <PageContainer className="gap-8">
      <BackLink fallback="/library" className="-mb-4" />
      <MediaDetailView media={media} listItem={listItem} list={list ?? null}>
        {seriesEpisodes.length > 1 && (
          <div className="-mx-6 lg:-mx-10">
            <MediaRow title={`More from ${media.series!.title}`} href={`/series/${media.series!.seriesId}`} items={seriesEpisodes} />
          </div>
        )}
        <RelatedVideos mediaId={id} relations={relations} />
      </MediaDetailView>
    </PageContainer>
  );
}
