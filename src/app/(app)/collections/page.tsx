import { FolderHeartIcon } from "lucide-react";
import type { Metadata } from "next";
import { CollectionCard } from "@/components/media/shelf-cards";
import { NewCollectionButton } from "@/components/organize/collection-view";
import { PageContainer, PageHeader } from "@/components/page-header";
import { listCollections } from "@/server/repositories/collections";

export const metadata: Metadata = { title: "Collections" };

export default function CollectionsPage() {
  const collections = listCollections();
  return (
    <PageContainer>
      <PageHeader title="Collections" description="Hand-picked lists in your own order." actions={<NewCollectionButton />} />
      {collections.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <FolderHeartIcon className="size-9 text-subtle-foreground" strokeWidth={1.5} />
          <p className="font-medium">No collections yet</p>
          <p className="text-sm text-muted-foreground">Create one here or use “Add to Collection” on any video.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-4 gap-y-6">
          {collections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
