"use server";

import { z } from "zod";
import { getMediaWithSource, removeFromLibrary, setFavorite, updateMediaMetadata } from "@/server/repositories/media";
import { setWatched } from "@/server/repositories/history";
import { addRelation, removeRelation } from "@/server/repositories/relations";
import { addCategoryToMedia, addTagsToMedia, createCategory, removeCategoryFromMedia, removeTagFromMedia } from "@/server/repositories/taxonomy";
import { addToCollection, createCollection } from "@/server/repositories/collections";
import { addEpisodes, createSeries, removeEpisodes, updateEpisode } from "@/server/repositories/series";
import { openWithDefaultApp, revealInFileManager } from "@/server/system";
import { assertServableMediaPath } from "@/server/media-paths";
import { runAction } from "./run-action";
import { idSchema, idsSchema, nameSchema, optionalTextSchema } from "./validators";

export async function setFavoriteAction(mediaIds: number[], favorite: boolean) {
  return runAction(() => setFavorite(idsSchema.parse(mediaIds), z.boolean().parse(favorite)));
}

export async function setWatchedAction(mediaIds: number[], watched: boolean) {
  return runAction(() => setWatched(idsSchema.parse(mediaIds), z.boolean().parse(watched)));
}

export async function updateMediaMetadataAction(mediaId: number, input: { displayTitle?: string; notes?: string | null }) {
  return runAction(() =>
    updateMediaMetadata(
      idSchema.parse(mediaId),
      z.object({ displayTitle: z.string().max(300).optional(), notes: optionalTextSchema }).parse(input),
    ),
  );
}

/** Removes entries from the library database only; files on disk are left untouched. */
export async function removeFromLibraryAction(mediaIds: number[]) {
  return runAction(() => removeFromLibrary(idsSchema.parse(mediaIds)));
}

export async function addTagsAction(mediaIds: number[], tagNames: string[]) {
  return runAction(() => addTagsToMedia(idsSchema.parse(mediaIds), z.array(z.string().trim().min(1).max(40)).min(1).max(50).parse(tagNames)));
}

export async function removeTagAction(mediaIds: number[], tagId: number) {
  return runAction(() => removeTagFromMedia(idsSchema.parse(mediaIds), idSchema.parse(tagId)));
}

export async function addCategoryAction(mediaIds: number[], category: number | { name: string }) {
  return runAction(() => {
    const ids = idsSchema.parse(mediaIds);
    const categoryId = typeof category === "number" ? idSchema.parse(category) : createCategory({ name: nameSchema.parse(category.name) }).id;
    addCategoryToMedia(ids, categoryId);
    return categoryId;
  });
}

export async function removeCategoryAction(mediaIds: number[], categoryId: number) {
  return runAction(() => removeCategoryFromMedia(idsSchema.parse(mediaIds), idSchema.parse(categoryId)));
}

export async function addToCollectionAction(mediaIds: number[], collection: number | { name: string }) {
  return runAction(() => {
    const ids = idsSchema.parse(mediaIds);
    const collectionId =
      typeof collection === "number" ? idSchema.parse(collection) : createCollection({ name: nameSchema.parse(collection.name) }).id;
    addToCollection(collectionId, ids);
    return collectionId;
  });
}

export async function addToSeriesAction(
  mediaIds: number[],
  series: number | { title: string },
  numbering?: { seasonNumber: number | null; episodeNumber: number | null },
) {
  return runAction(() => {
    const ids = idsSchema.parse(mediaIds);
    const seriesId = typeof series === "number" ? idSchema.parse(series) : createSeries({ title: nameSchema.parse(series.title) }).id;
    const parsedNumbering = numbering
      ? z.object({ seasonNumber: z.number().int().min(0).max(999).nullable(), episodeNumber: z.number().min(0).max(99999).nullable() }).parse(numbering)
      : undefined;
    addEpisodes(
      seriesId,
      ids.map((mediaId) => (ids.length === 1 && parsedNumbering ? { mediaId, ...parsedNumbering } : { mediaId })),
    );
    return seriesId;
  });
}

export async function updateEpisodeAction(mediaId: number, input: { seasonNumber: number | null; episodeNumber: number | null }) {
  return runAction(() =>
    updateEpisode(
      idSchema.parse(mediaId),
      z.object({ seasonNumber: z.number().int().min(0).max(999).nullable(), episodeNumber: z.number().min(0).max(99999).nullable() }).parse(input),
    ),
  );
}

export async function removeFromSeriesAction(mediaIds: number[]) {
  return runAction(() => removeEpisodes(idsSchema.parse(mediaIds)));
}

export async function addRelationAction(sourceMediaId: number, targetMediaId: number, type: "related" | "continuation") {
  return runAction(() => addRelation(idSchema.parse(sourceMediaId), idSchema.parse(targetMediaId), z.enum(["related", "continuation"]).parse(type)));
}

export async function removeRelationAction(relationId: number) {
  return runAction(() => removeRelation(idSchema.parse(relationId)));
}

async function resolvePlayableFile(mediaId: number): Promise<string> {
  const row = getMediaWithSource(idSchema.parse(mediaId));
  if (!row) throw new Error("Video not found.");
  await assertServableMediaPath(row.source.path, row.media.absolutePath);
  return row.media.absolutePath;
}

export async function showInFolderAction(mediaId: number) {
  return runAction(
    async () => {
      const ok = await revealInFileManager(await resolvePlayableFile(mediaId));
      if (!ok) throw new Error("Could not open the file manager.");
    },
    { revalidate: false },
  );
}

export async function openExternallyAction(mediaId: number) {
  return runAction(
    async () => {
      const ok = await openWithDefaultApp(await resolvePlayableFile(mediaId));
      if (!ok) throw new Error("Could not open the default video player.");
    },
    { revalidate: false },
  );
}
