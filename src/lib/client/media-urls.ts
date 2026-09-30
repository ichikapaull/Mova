import type { MediaListItem } from "@/lib/library-query";

export function thumbnailUrl(item: Pick<MediaListItem, "id" | "version">): string {
  return `/api/media/${item.id}/thumbnail?v=${item.version}`;
}

export function previewUrl(item: Pick<MediaListItem, "id" | "version">): string {
  return `/api/media/${item.id}/preview?v=${item.version}`;
}

export function streamUrl(id: number): string {
  return `/api/media/${id}/stream`;
}

export function watchHref(id: number, options: { list?: string | null; t?: number } = {}): string {
  const params = new URLSearchParams();
  if (options.list) params.set("list", options.list);
  if (options.t != null) params.set("t", String(Math.floor(options.t)));
  const qs = params.toString();
  return `/watch/${id}${qs ? `?${qs}` : ""}`;
}
