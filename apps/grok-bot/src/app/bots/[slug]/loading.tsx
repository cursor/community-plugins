export default function BotLoading() {
  return (
    <div
      className="detail"
      role="status"
      aria-label="Loading bot"
      data-testid="page-skeleton"
    >
      <div className="skeleton-rows loading" aria-hidden="true">
        <span className="sk" style={{ width: 120, height: 14 }} />
        <div style={{ height: 32 }} />
        <span
          className="sk"
          style={{ width: 96, height: 96, borderRadius: "50%" }}
        />
        <div style={{ height: 16 }} />
        <span className="sk" style={{ width: "35%", height: 32 }} />
        <div style={{ height: 12 }} />
        <span className="sk" style={{ width: "25%", height: 12 }} />
        <div style={{ height: 20 }} />
        <span className="sk" style={{ width: "70%", height: 12 }} />
        <div style={{ height: 8 }} />
        <span className="sk" style={{ width: "55%", height: 12 }} />
      </div>
    </div>
  );
}
