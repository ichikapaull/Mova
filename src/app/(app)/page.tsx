import { FolderPlusIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeHero } from "@/components/media/home-hero";
import { MediaRow, RowSlot } from "@/components/media/media-row";
import { CollectionCard, SeriesCard } from "@/components/media/shelf-cards";
import { Button } from "@/components/ui/button";
import { listCollections } from "@/server/repositories/collections";
import {
  countVisibleMedia,
  listByCategory,
  listContinueWatching,
  listFavorites,
  listRecentlyAdded,
  listShortVideos,
} from "@/server/repositories/library";
import { listSeries } from "@/server/repositories/series";
import { getSettings } from "@/server/repositories/settings";
import { countSources } from "@/server/repositories/sources";
import { listCategories } from "@/server/repositories/taxonomy";

export default function HomePage() {
  const settings = getSettings();
  const sourceCount = countSources();
  if (!settings.setupCompleted && sourceCount === 0) redirect("/setup");

  const total = countVisibleMedia();
  if (total === 0) return <EmptyHome hasSources={sourceCount > 0} />;

  const continueWatching = listContinueWatching(20, settings.completedThreshold);
  const recent = listRecentlyAdded(24);
  const favorites = listFavorites(24);
  const shortVideos = listShortVideos(300, 24);
  const categoryRows = listCategories()
    .filter((category) => category.count > 0)
    .map((category) => ({ category, items: listByCategory(category.id, 24) }));
  const series = listSeries().filter((s) => s.episodeCount > 0);
  const collections = listCollections().filter((c) => c.count > 0);

  const hero = continueWatching[0] ?? recent[0]!;
  const heroEyebrow = continueWatching[0] ? "Continue watching" : "Recently added";

  return (
    <div className="flex flex-col gap-9 pb-16">
      <HomeHero item={hero} eyebrow={heroEyebrow} />
      {continueWatching.length > 0 && <MediaRow title="Continue Watching" items={continueWatching} clickAction="play" />}
      <MediaRow title="Recently Added" href="/recent" items={recent} />
      {favorites.length > 0 && <MediaRow title="Favorites" href="/favorites" items={favorites} />}
      {series.length > 0 && (
        <MediaRow title="Series" href="/series">
          {series.slice(0, 20).map((s) => (
            <RowSlot key={s.id}>
              <SeriesCard series={s} />
            </RowSlot>
          ))}
        </MediaRow>
      )}
      {categoryRows.map(({ category, items }) => (
        <MediaRow key={category.id} title={category.name} href={`/categories/${category.id}`} items={items} />
      ))}
      {shortVideos.length > 0 && <MediaRow title="Short Videos" items={shortVideos} />}
      {collections.length > 0 && (
        <MediaRow title="Collections" href="/collections">
          {collections.slice(0, 20).map((c) => (
            <RowSlot key={c.id}>
              <CollectionCard collection={c} />
            </RowSlot>
          ))}
        </MediaRow>
      )}
    </div>
  );
}

function EmptyHome({ hasSources }: { hasSources: boolean }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-border">
        <FolderPlusIcon className="size-6 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{hasSources ? "No videos found yet" : "Your library is empty"}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hasSources
          ? "Your media folders are being scanned, or they don't contain supported video files. New videos will appear here automatically."
          : "Add a folder with videos and Mova will index it — your files stay exactly where they are."}
      </p>
      <Button asChild>
        <Link href="/settings#sources">{hasSources ? "Manage media folders" : "Add media folder"}</Link>
      </Button>
    </div>
  );
}
