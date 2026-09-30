import { listCollections } from "@/server/repositories/collections";
import { listSeries } from "@/server/repositories/series";
import { listSources } from "@/server/repositories/sources";
import { listCategories, listTags } from "@/server/repositories/taxonomy";

/** Lists used by pickers (tag autocomplete, category/collection/series dialogs). */
export async function GET() {
  return Response.json(
    {
      tags: listTags(),
      categories: listCategories(),
      collections: listCollections().map(({ id, name, count }) => ({ id, name, count })),
      series: listSeries().map(({ id, title, episodeCount }) => ({ id, title, episodeCount })),
      sources: listSources().map(({ id, name, videoCount }) => ({ id, name, count: videoCount })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
