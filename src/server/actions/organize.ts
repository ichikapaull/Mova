"use server";

import { z } from "zod";
import { deleteCollection, removeFromCollection, reorderCollection, updateCollection, createCollection } from "@/server/repositories/collections";
import {
  autoNumberEpisodes,
  createSeries,
  deleteSeries,
  normalizePositions,
  reorderEpisodes,
  updateSeries,
} from "@/server/repositories/series";
import { createCategory, deleteCategory, deleteTag, renameTag, reorderCategories, updateCategory } from "@/server/repositories/taxonomy";
import { runAction } from "./run-action";
import { idSchema, nameSchema, optionalTextSchema } from "./validators";

const orderSchema = z.array(idSchema).max(20_000);

// Tags ----------------------------------------------------------------------

export async function renameTagAction(tagId: number, name: string) {
  return runAction(() => renameTag(idSchema.parse(tagId), z.string().max(40).parse(name)));
}

export async function deleteTagAction(tagId: number) {
  return runAction(() => deleteTag(idSchema.parse(tagId)));
}

// Categories ------------------------------------------------------------------

const categoryInput = z.object({ name: nameSchema, icon: z.string().max(40).nullable().optional(), description: optionalTextSchema });

export async function createCategoryAction(input: { name: string; icon?: string | null; description?: string | null }) {
  return runAction(() => createCategory(categoryInput.parse(input)));
}

export async function updateCategoryAction(categoryId: number, input: { name?: string; icon?: string | null; description?: string | null }) {
  return runAction(() => updateCategory(idSchema.parse(categoryId), categoryInput.partial().parse(input)));
}

export async function deleteCategoryAction(categoryId: number) {
  return runAction(() => deleteCategory(idSchema.parse(categoryId)));
}

export async function reorderCategoriesAction(orderedIds: number[]) {
  return runAction(() => reorderCategories(orderSchema.parse(orderedIds)));
}

// Collections -----------------------------------------------------------------

export async function createCollectionAction(input: { name: string; description?: string | null }) {
  return runAction(() => createCollection(z.object({ name: nameSchema, description: optionalTextSchema }).parse(input)));
}

export async function updateCollectionAction(collectionId: number, input: { name?: string; description?: string | null }) {
  return runAction(() =>
    updateCollection(idSchema.parse(collectionId), z.object({ name: nameSchema.optional(), description: optionalTextSchema }).parse(input)),
  );
}

export async function deleteCollectionAction(collectionId: number) {
  return runAction(() => deleteCollection(idSchema.parse(collectionId)));
}

export async function removeFromCollectionAction(collectionId: number, mediaIds: number[]) {
  return runAction(() => removeFromCollection(idSchema.parse(collectionId), orderSchema.parse(mediaIds)));
}

export async function reorderCollectionAction(collectionId: number, orderedMediaIds: number[]) {
  return runAction(() => reorderCollection(idSchema.parse(collectionId), orderSchema.parse(orderedMediaIds)));
}

// Series ----------------------------------------------------------------------

export async function createSeriesAction(input: { title: string; description?: string | null }) {
  return runAction(() => createSeries(z.object({ title: nameSchema, description: optionalTextSchema }).parse(input)));
}

export async function updateSeriesAction(seriesId: number, input: { title?: string; description?: string | null; posterMediaId?: number | null }) {
  return runAction(() =>
    updateSeries(
      idSchema.parse(seriesId),
      z.object({ title: nameSchema.optional(), description: optionalTextSchema, posterMediaId: idSchema.nullable().optional() }).parse(input),
    ),
  );
}

export async function deleteSeriesAction(seriesId: number) {
  return runAction(() => deleteSeries(idSchema.parse(seriesId)));
}

export async function reorderEpisodesAction(seriesId: number, orderedMediaIds: number[]) {
  return runAction(() => reorderEpisodes(idSchema.parse(seriesId), orderSchema.parse(orderedMediaIds)));
}

export async function sortEpisodesByNumberAction(seriesId: number) {
  return runAction(() => normalizePositions(idSchema.parse(seriesId), true));
}

export async function autoNumberEpisodesAction(seriesId: number) {
  return runAction(() => autoNumberEpisodes(idSchema.parse(seriesId)));
}
