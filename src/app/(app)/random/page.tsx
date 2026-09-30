import type { Metadata } from "next";
import { RandomView } from "@/components/media/random-picks";
import { PageContainer } from "@/components/page-header";
import { RANDOM_PICKS } from "@/lib/constants";
import { newShuffleSeed } from "@/lib/shuffle";
import { listShuffled } from "@/server/repositories/library";

export const metadata: Metadata = { title: "Random" };

export default function RandomPage() {
  const seed = newShuffleSeed();
  return (
    <PageContainer>
      <RandomView initial={{ seed, items: listShuffled(seed, RANDOM_PICKS) }} />
    </PageContainer>
  );
}
