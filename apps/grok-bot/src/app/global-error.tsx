"use client";

// Last resort when the root layout itself fails, so it can't rely on the
// app's styles or components.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          background: "#fff",
          color: "#0a0a0a",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 500, margin: "0 0 8px" }}>
            Grok Bot Directory is having trouble
          </h1>
          <p style={{ color: "#737373", margin: "0 0 24px" }}>
            Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 999,
              background: "#0a0a0a",
              color: "#fff",
              font: "inherit",
              padding: "10px 20px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
