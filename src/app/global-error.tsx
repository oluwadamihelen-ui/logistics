"use client";

/** Last-resort boundary (errors in the root layout). Must render its own <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#0f172a", textAlign: "center", padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p style={{ color: "#64748b", maxWidth: 420 }}>An unexpected error occurred{error.digest ? ` (reference ${error.digest})` : ""}. Please try again.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 8, border: 0, background: "#0f62fe", color: "#fff", cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
