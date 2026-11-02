// Loading skeletons for route transitions. They shimmer because something
// really is loading (resting placeholders are plain outlines instead).

function Bar({
  w,
  h = 10,
  round,
}: {
  w: string | number;
  h?: number;
  round?: boolean;
}) {
  return (
    <span
      className="sk"
      style={{ width: w, height: h, borderRadius: round ? "50%" : 999 }}
    />
  );
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton-rows loading" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <div key={i} className="skeleton-row">
          <Bar w={44} h={44} round />
          <div className="skeleton-lines">
            <Bar w={`${30 + ((i * 17) % 25)}%`} h={12} />
            <Bar w={`${60 + ((i * 13) % 30)}%`} />
          </div>
          <Bar w={48} h={28} />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({
  title = "Loading",
  rows = 4,
}: {
  title?: string;
  rows?: number;
}) {
  return (
    <div
      className="shell page subs-page"
      role="status"
      aria-label={title}
      data-testid="page-skeleton"
    >
      <div
        className="skeleton-rows loading"
        aria-hidden="true"
        style={{ marginBottom: 32 }}
      >
        <Bar w="40%" h={36} />
        <div style={{ height: 12 }} />
        <Bar w="60%" h={14} />
      </div>
      <RowsSkeleton rows={rows} />
    </div>
  );
}
