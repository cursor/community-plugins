// Below this, add counts are hidden on public pages: a handful of adds reads
// as "nobody uses this" more than as a number.
const MIN_SHOWN_ADDS = 5;

/** "12 adds", or null when there are too few to show. */
export function formatAdds(n: number): string | null {
  if (n < MIN_SHOWN_ADDS) return null;
  return `${formatCount(n)} adds`;
}

/** The bare add count for a list row, or "" when there are too few. */
export function formatAddCount(n: number): string {
  return n < MIN_SHOWN_ADDS ? "" : formatCount(n);
}

export function formatCount(n: number): string {
  if (n >= 1000)
    return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
}

const DAY = 86_400_000;

export function formatRelativeDate(iso: string, now = Date.now()): string {
  const days = Math.floor(Math.max(0, now - new Date(iso).getTime()) / DAY);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}
