"use client";

import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { useMediaActions } from "@/components/media/media-actions";
import { TagInput } from "@/components/media/tag-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ActionResult } from "@/lib/action-result";
import { callAction } from "@/lib/client/run-action";
import { useTaxonomy } from "@/lib/client/taxonomy";
import { cn } from "@/lib/utils";
import { addCategoryAction, addTagsAction, removeCategoryAction, removeTagAction } from "@/server/actions/media";

const chipClass =
  "group inline-flex h-7 items-center gap-1.5 rounded-full border border-border-strong bg-white/[0.03] pr-1.5 pl-3 text-[13px] transition-colors hover:bg-white/[0.07]";
const addChipClass =
  "inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border-strong px-3 text-[13px] text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground";

export function TagEditor({ mediaId, tags }: { mediaId: number; tags: Array<{ id: number; name: string }> }) {
  const actions = useMediaActions();
  const [open, setOpen] = useState(false);
  const { data, reload } = useTaxonomy(open);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag.id} className={chipClass}>
          <Link href={`/tags/${tag.id}`} className="hover:underline">
            #{tag.name}
          </Link>
          <button
            type="button"
            aria-label={`Remove tag ${tag.name}`}
            onClick={async () => {
              if ((await callAction(removeTagAction([mediaId], tag.id))) !== undefined) actions.refresh();
            }}
            className="rounded-full p-0.5 text-subtle-foreground hover:bg-white/10 hover:text-foreground"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={addChipClass}>
          <PlusIcon className="size-3.5" /> Add Tag
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <TagInput
            autoFocus
            suggestions={data?.tags ?? []}
            exclude={tags.map((t) => t.name)}
            onPick={async (name) => {
              if ((await callAction(addTagsAction([mediaId], [name]))) !== undefined) {
                actions.refresh();
                reload();
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function CategoryEditor({ mediaId, categories }: { mediaId: number; categories: Array<{ id: number; name: string; icon: string | null }> }) {
  const actions = useMediaActions();
  const [open, setOpen] = useState(false);
  const { data } = useTaxonomy(open);
  const assigned = new Set(categories.map((c) => c.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {categories.map((category) => (
        <span key={category.id} className={chipClass}>
          <CategoryIcon name={category.icon} className="size-3.5 text-muted-foreground" />
          <Link href={`/categories/${category.id}`} className="hover:underline">
            {category.name}
          </Link>
          <button
            type="button"
            aria-label={`Remove from ${category.name}`}
            onClick={async () => {
              if ((await callAction(removeCategoryAction([mediaId], category.id))) !== undefined) actions.refresh();
            }}
            className="rounded-full p-0.5 text-subtle-foreground hover:bg-white/10 hover:text-foreground"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={addChipClass}>
          <PlusIcon className="size-3.5" /> Category
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1">
          {!data && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
          {data?.categories.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              No categories yet. <Link href="/categories" className="underline">Create one</Link>.
            </p>
          )}
          {data?.categories.map((category) => {
            const checked = assigned.has(category.id);
            return (
              <button
                key={category.id}
                type="button"
                onClick={async () => {
                  const action: Promise<ActionResult<unknown>> = checked
                    ? removeCategoryAction([mediaId], category.id)
                    : addCategoryAction([mediaId], category.id);
                  if ((await callAction(action)) !== undefined) actions.refresh();
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-white/[0.06]"
              >
                <CategoryIcon name={category.icon} className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{category.name}</span>
                <CheckIcon className={cn("size-4", checked ? "opacity-100" : "opacity-0")} />
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}
