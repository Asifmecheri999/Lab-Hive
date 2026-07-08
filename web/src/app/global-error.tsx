"use client";

// Catches errors thrown from the ROOT layout itself (the last line of defence against a
// white screen). It replaces the whole document, so it renders its own <html>/<body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#0A1628", color: "#fff", minHeight: "100vh", margin: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 440 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 16px" }}>Please refresh the page. If the problem keeps happening, try again in a moment.</p>
          <button
            onClick={() => { try { reset(); } catch { window.location.reload(); } }}
            style={{ background: "#00C9A7", color: "#0A1628", border: 0, borderRadius: 8, padding: "8px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  );
}
