type Page = PromiseLike<{
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
}>;

/**
 * Every row a query matches. The hosted Data API returns at most 100 rows a
 * request (fewer than a local stack does), so a list that can grow past that
 * is read a page at a time: the first page says how many rows there are, and
 * the rest are fetched together.
 *
 * `page(from, to)` builds the query afresh each time: selected with
 * `{ count: "exact" }`, in an order that doesn't change between requests
 * (end with a unique column), and ending in `.range(from, to)`.
 */
export async function allRows<T>(
  page: (from: number, to: number) => Page,
): Promise<T[]> {
  const first = await page(0, 999);
  if (first.error) throw new Error(first.error.message);
  const rows = (first.data ?? []) as T[];
  const total = first.count ?? rows.length;
  // However many came back is the most the server gives in one request.
  const size = rows.length;
  if (size === 0 || size >= total) return rows;
  const rest = await Promise.all(
    Array.from({ length: Math.ceil((total - size) / size) }, (_, i) =>
      page((i + 1) * size, (i + 2) * size - 1),
    ),
  );
  for (const next of rest) {
    if (next.error) throw new Error(next.error.message);
    rows.push(...((next.data ?? []) as T[]));
  }
  return rows;
}

/**
 * Every row whose `column` is one of `ids`. The ids travel in the request's
 * address, so they go a hundred at a time. `page(group, from, to)` is as for
 * `allRows`, with `.in(column, group)`.
 */
export async function allRowsIn<T>(
  ids: string[],
  page: (group: string[], from: number, to: number) => Page,
): Promise<T[]> {
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) groups.push(ids.slice(i, i + 100));
  const found = await Promise.all(
    groups.map((group) => allRows<T>((from, to) => page(group, from, to))),
  );
  return found.flat();
}
