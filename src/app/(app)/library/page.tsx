import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MediaBrowser } from "@/components/media/media-browser";
import { PageContainer, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <PageContainer>
      <PageHeader title="Library" />
      <Suspense>
        <MediaBrowser
          emptyMessage={
            <>
              <p className="text-base font-medium">Your library is empty</p>
              <p className="text-sm text-muted-foreground">Add a media folder to start.</p>
              <Button asChild size="sm" variant="secondary">
                <Link href="/settings#sources">Add media folder</Link>
              </Button>
            </>
          }
        />
      </Suspense>
    </PageContainer>
  );
}
