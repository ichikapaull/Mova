import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { MediaBrowser } from "@/components/media/media-browser";
import { CategoryManageMenu } from "@/components/organize/category-actions";
import { PageContainer, PageHeader } from "@/components/page-header";
import { getCategory } from "@/server/repositories/taxonomy";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getCategory(Number((await params).id))?.name ?? "Category" };
}

export default async function CategoryPage({ params }: Props) {
  const category = getCategory(Number((await params).id));
  if (!category) notFound();
  return (
    <PageContainer>
      <PageHeader
        eyebrow={<Link href="/categories" className="hover:text-foreground">Categories</Link>}
        title={
          <span className="flex items-center gap-3">
            <CategoryIcon name={category.icon} className="size-6 text-muted-foreground" />
            {category.name}
          </span>
        }
        description={category.description}
        actions={<CategoryManageMenu category={category} />}
      />
      <Suspense>
        <MediaBrowser preset={{ categories: [category.id] }} />
      </Suspense>
    </PageContainer>
  );
}
