import type { Metadata } from "next";
import { Suspense } from "react";
import { MediaBrowser } from "@/components/media/media-browser";
import { PageContainer, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Recently Added" };

export default function RecentPage() {
  return (
    <PageContainer>
      <PageHeader title="Recently Added" description="Newest videos first." />
      <Suspense>
        <MediaBrowser preset={{ sort: "added", dir: "desc" }} />
      </Suspense>
    </PageContainer>
  );
}
