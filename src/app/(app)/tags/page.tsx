import { HashIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/page-header";
import { listTags } from "@/server/repositories/taxonomy";

export const metadata: Metadata = { title: "Tags" };

export default function TagsPage() {
  const tags = listTags();
  const max = Math.max(1, ...tags.map((t) => t.count));
  return (
    <PageContainer>
      <PageHeader title="Tags" description="Click a tag to see every video that has it. Add tags from a video's menu or detail page." />
      {tags.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <HashIcon className="size-9 text-subtle-foreground" strokeWidth={1.5} />
          <p className="font-medium">No tags yet</p>
          <p className="text-sm text-muted-foreground">Right-click any video → Add Tag, or select several and tag them at once.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {tags.map((tag) => {
            const weight = tag.count / max;
            return (
              <Link
                key={tag.id}
                href={`/tags/${tag.id}`}
                className="group inline-flex items-center gap-2 rounded-full border border-border-strong bg-white/[0.03] px-3.5 py-1.5 transition-colors hover:border-white/25 hover:bg-white/[0.07]"
                style={{ fontSize: `${13 + Math.round(weight * 4)}px` }}
              >
                <span className="text-subtle-foreground group-hover:text-muted-foreground">#</span>
                <span className="font-medium">{tag.name}</span>
                <span className="text-xs text-subtle-foreground tabular-nums">{tag.count}</span>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
