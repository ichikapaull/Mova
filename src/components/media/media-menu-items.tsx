"use client";

import {
  CheckCircle2Icon,
  CircleIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  HeartIcon,
  HeartOffIcon,
  PencilIcon,
  PlayIcon,
  ShapesIcon,
  TagIcon,
  Trash2Icon,
  TvIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { useMediaActions } from "@/components/media/media-actions";
import { watchHref } from "@/lib/client/media-urls";
import type { MediaListItem } from "@/lib/library-query";

type ItemComponent = React.ComponentType<{
  onSelect?: (event: Event) => void;
  variant?: "destructive";
  children: React.ReactNode;
}>;

/** Quick actions shared by the "…" dropdown and the right-click context menu. */
export function MediaMenuItems({
  item,
  Item,
  Separator,
  list,
}: {
  item: MediaListItem;
  Item: ItemComponent;
  Separator: React.ComponentType;
  list?: string | null;
}) {
  const router = useRouter();
  const actions = useMediaActions();
  const target = { ids: [item.id], title: item.title };
  return (
    <>
      <Item onSelect={() => router.push(watchHref(item.id, { list }))}>
        <PlayIcon /> Play
      </Item>
      <Item onSelect={() => actions.setFavorite([item.id], !item.isFavorite)}>
        {item.isFavorite ? <HeartOffIcon /> : <HeartIcon />}
        {item.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
      </Item>
      <Separator />
      <Item onSelect={() => actions.openDialog("tag", target)}>
        <TagIcon /> Add Tag…
      </Item>
      <Item onSelect={() => actions.openDialog("category", target)}>
        <ShapesIcon /> Add Category…
      </Item>
      <Item onSelect={() => actions.openDialog("collection", target)}>
        <FolderPlusIcon /> Add to Collection…
      </Item>
      <Item onSelect={() => actions.openDialog("series", target)}>
        <TvIcon /> Add to Series…
      </Item>
      <Separator />
      <Item onSelect={() => actions.setWatched([item.id], !item.completed)}>
        {item.completed ? <CircleIcon /> : <CheckCircle2Icon />}
        {item.completed ? "Mark Unwatched" : "Mark Watched"}
      </Item>
      <Item onSelect={() => actions.showInFolder(item.id)}>
        <FolderOpenIcon /> Show in Folder
      </Item>
      <Item onSelect={() => actions.openDialog("edit", target)}>
        <PencilIcon /> Edit Metadata…
      </Item>
      <Separator />
      <Item variant="destructive" onSelect={() => actions.openDialog("remove", target)}>
        <Trash2Icon /> Remove from Library
      </Item>
    </>
  );
}
