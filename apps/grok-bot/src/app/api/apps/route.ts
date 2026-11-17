import { listApps, toAppListItem } from "@/data/apps";

/**
 * Every app as list rows, for the Apps tab's search and "Show more". The
 * page itself renders only the first rows; the browser fetches this once it
 * needs the rest. Cached at the edge, so the database sees it at most every
 * few minutes.
 */
export async function GET() {
  const apps = (await listApps()).map(toAppListItem);
  return Response.json(apps, {
    headers: {
      "Cache-Control":
        "public, s-maxage=300, stale-while-revalidate=3600, max-age=60",
    },
  });
}
