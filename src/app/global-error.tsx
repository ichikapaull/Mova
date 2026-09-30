"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#090909", color: "#f4f4f3", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Mova hit an unexpected error</h1>
          <p style={{ color: "#9a9a98", fontSize: 14 }}>{error.message}</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, background: "#f4f4f3", color: "#0b0b0b", border: 0 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
