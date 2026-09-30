import { ShapesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { NewCategoryButton } from "@/components/organize/category-actions";
import { PageContainer, PageHeader } from "@/components/page-header";
import { pluralize } from "@/lib/format";
import { listCategories } from "@/server/repositories/taxonomy";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  const categories = listCategories();
  return (
    <PageContainer>
      <PageHeader
        title="Categories"
        description="Broad groups like Anime, Movies or Clips. Set a default category per media folder in Settings."
        actions={<NewCategoryButton showDefaults={categories.length === 0} />}
      />
      {categories.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <ShapesIcon className="size-9 text-subtle-foreground" strokeWidth={1.5} />
          <p className="font-medium">No categories yet</p>
          <p className="text-sm text-muted-foreground">Create your own or add the defaults (Anime, Movies, Series, Clips, Music, Documentary).</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/categories/${category.id}`}
              className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-elevated"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground transition-colors group-hover:text-foreground">
                <CategoryIcon name={category.icon} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{category.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {category.description || pluralize(category.count, "video")}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
