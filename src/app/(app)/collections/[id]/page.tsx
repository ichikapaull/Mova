import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionView } from "@/components/organize/collection-view";
import { PageContainer } from "@/components/page-header";
import { getCollection } from "@/server/repositories/collections";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getCollection(Number((await params).id))?.name ?? "Collection" };
}

export default async function CollectionPage({ params }: Props) {
  const collection = getCollection(Number((await params).id));
  if (!collection) notFound();
  return (
    <PageContainer className="max-w-5xl">
      <CollectionView collection={collection} />
    </PageContainer>
  );
}
