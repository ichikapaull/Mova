"use client";

import { ShuffleIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MediaCard } from "@/components/media/media-card";
import { MediaRow } from "@/components/media/media-row";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useLibraryGeneration } from "@/lib/client/library-cache";
import { RANDOM_PICKS } from "@/lib/constants";
import type { MediaListItem } from "@/lib/library-query";
import { newShuffleSeed, shuffleListParam } from "@/lib/shuffle";
import { cn } from "@/lib/utils";

export type RandomPicks = { seed: number; items: MediaListItem[] };

/**
 * Latest picks per server-rendered seed. Going back to a page replays its cached server
 * render, so this restores whatever the user shuffled to since. Only written client-side.
 */
const remembered = new Map<number, RandomPicks>();

/**
 * Keeps a set of random picks stable for the life of the page: server refreshes (background
 * jobs, favorites) only reload the same videos; new picks come solely from `shuffle`.
 */
function useRandomPicks(initial: RandomPicks) {
  const [picks, setPicks] = useState<RandomPicks>(() => remembered.get(initial.seed) ?? initial);
  const [pending, setPending] = useState(false);
  const latestRequest = useRef(0);
  const generation = useLibraryGeneration();
  const seenGeneration = useRef(generation);

  const load = useCallback(
    async (query: string, seed: number) => {
      const request = ++latestRequest.current;
      const response = await fetch(`/api/media/picks?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Picks request failed (${response.status})`);
      const { items } = (await response.json()) as { items: MediaListItem[] };
      if (request !== latestRequest.current) return;
      const next = { seed, items };
      remembered.set(initial.seed, next);
      if (remembered.size > 20) remembered.delete(remembered.keys().next().value!);
      setPicks(next);
    },
    [initial.seed],
  );

  useEffect(() => {
    if (seenGeneration.current === generation) return;
    seenGeneration.current = generation;
    load(`ids=${picks.items.map((item) => item.id).join(",")}`, picks.seed).catch(() => undefined);
  }, [generation, load, picks]);

  const shuffle = useCallback(() => {
    const seed = newShuffleSeed();
    setPending(true);
    load(`seed=${seed.toString(36)}&limit=${RANDOM_PICKS}`, seed)
      .catch(() => toast.error("Could not shuffle. Is Mova still running?"))
      .finally(() => setPending(false));
  }, [load]);

  return { items: picks.items, list: shuffleListParam(picks.seed), shuffle, pending };
}

function ShuffleButton({ onClick, pending, size }: { onClick: () => void; pending: boolean; size?: "sm" }) {
  return (
    <Button variant="secondary" size={size} disabled={pending} onClick={onClick}>
      <ShuffleIcon className={cn(pending && "animate-pulse")} />
      Shuffle
    </Button>
  );
}

/** Home page shelf. */
export function RandomRow({ initial }: { initial: RandomPicks }) {
  const { items, list, shuffle, pending } = useRandomPicks(initial);
  return (
    <MediaRow
      title="Random"
      href="/random"
      items={items}
      list={list}
      actions={<ShuffleButton size="sm" onClick={shuffle} pending={pending} />}
    />
  );
}

/** The /random page. */
export function RandomView({ initial }: { initial: RandomPicks }) {
  const { items, list, shuffle, pending } = useRandomPicks(initial);
  return (
    <>
      <PageHeader
        title="Random"
        description="A dozen picks from your library. Playing one keeps going in shuffle order."
        actions={items.length > 0 && <ShuffleButton onClick={shuffle} pending={pending} />}
      />
      {items.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-4 gap-y-6">
          {items.map((item, index) => (
            <MediaCard key={item.id} item={item} list={list} eager={index < 8} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 py-24 text-center">
          <p className="text-base font-medium">Nothing to pick from yet</p>
          <p className="text-sm text-muted-foreground">Add a media folder and random picks will show up here.</p>
        </div>
      )}
    </>
  );
}
