import type { Metadata } from "next";
import { Suspense } from "react";
import { MediaBrowser } from "@/components/media/media-browser";
import { PageContainer, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Favorites" };

export default function FavoritesPage() {
  return (
    <PageContainer>
      <PageHeader title="Favorites" />
      <Suspense>
        <MediaBrowser
          preset={{ favorite: true }}
          emptyMessage={
            <>
              <p className="text-base font-medium">No favorites yet</p>
              <p className="text-sm text-muted-foreground">Use the heart on any video to keep it here.</p>
            </>
          }
        />
      </Suspense>
    </PageContainer>
  );
}
