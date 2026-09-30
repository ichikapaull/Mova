import { parseLibraryQuery } from "@/lib/library-query";
import { queryLibrary, queryLibraryIds } from "@/server/repositories/library";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = parseLibraryQuery(params);
  if (params.get("idsOnly") === "1") return Response.json({ ids: queryLibraryIds(query) });
  const offset = Math.max(0, Math.min(1_000_000, Number(params.get("offset")) || 0));
  const limit = Math.max(1, Math.min(200, Number(params.get("limit")) || 60));
  return Response.json(queryLibrary(query, offset, limit));
}
