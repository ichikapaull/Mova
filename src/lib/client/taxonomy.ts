"use client";

import { useEffect, useState } from "react";

export type TaxonomyData = {
  tags: Array<{ id: number; name: string; count: number }>;
  categories: Array<{ id: number; name: string; icon: string | null; count: number }>;
  collections: Array<{ id: number; name: string; count: number }>;
  series: Array<{ id: number; title: string; episodeCount: number }>;
  sources: Array<{ id: number; name: string; count: number }>;
};

/** Loads tag/category/collection/series lists when `enabled` becomes true. */
export function useTaxonomy(enabled: boolean): { data: TaxonomyData | null; reload: () => void } {
  const [data, setData] = useState<TaxonomyData | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/taxonomy", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<TaxonomyData>) : null))
      .then((value) => value && setData(value))
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, nonce]);
  return { data, reload: () => setNonce((n) => n + 1) };
}
