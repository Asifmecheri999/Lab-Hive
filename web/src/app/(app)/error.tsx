"use client";

// Error boundary for the authenticated app. Any render/runtime error inside an (app)
// page is caught here so the user sees a recoverable message + actions instead of a
// blank white screen. The sidebar/shell stays mounted (this only replaces the page body).
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-5xl">⚠️</div>
      <h2 className="text-xl font-bold text-[#0A1628]">Something went wrong</h2>
      <p className="max-w-md text-sm text-gray-500">
        An unexpected error occurred on this page. Please try again — if it keeps happening, refresh.
      </p>
      {process.env.NODE_ENV !== "production" && error?.message ? (
        <pre className="max-w-lg overflow-auto rounded bg-gray-50 px-3 py-2 text-left text-xs text-gray-500">{error.message}</pre>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={() => reset()} className="rounded-lg bg-[#00C9A7] px-4 py-2 text-sm font-semibold text-[#0A1628] transition hover:brightness-95">Try again</button>
        <button onClick={() => window.location.reload()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Refresh page</button>
      </div>
    </div>
  );
}
