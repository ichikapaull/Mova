import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TagManageMenu } from "@/components/organize/tag-manage-menu";
import { MediaBrowser } from "@/components/media/media-browser";
import { PageContainer, PageHeader } from "@/components/page-header";
import { getTag } from "@/server/repositories/taxonomy";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = getTag(Number((await params).id));
  return { title: tag ? `#${tag.name}` : "Tag" };
}

export default async function TagPage({ params }: Props) {
  const tag = getTag(Number((await params).id));
  if (!tag) notFound();
  return (
    <PageContainer>
      <PageHeader
        eyebrow={<Link href="/tags" className="hover:text-foreground">Tags</Link>}
        title={`#${tag.name}`}
        actions={<TagManageMenu tag={tag} />}
      />
      <Suspense>
        <MediaBrowser preset={{ tags: [tag.id] }} />
      </Suspense>
    </PageContainer>
  );
}
