"use client";

/**
 * The last resort: the root layout itself failed.
 *
 * This replaces the whole document, so it carries its own <html> and
 * cannot rely on any styling, font or provider the app sets up. Written
 * with inline styles for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          margin: 0,
          padding: "4rem 1rem",
          color: "#0f172a",
        }}
      >
        <main style={{ maxWidth: "32rem", margin: "0 auto" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            Driplin could not load
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#475569" }}>
            Nothing has been changed or lost, and the nightly compliance
            checks run independently of this page. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              background: "#0f172a",
              color: "white",
              border: 0,
              borderRadius: "0.375rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.75rem",
                color: "#64748b",
              }}
            >
              Reference: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
