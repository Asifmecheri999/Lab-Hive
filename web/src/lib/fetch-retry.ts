// Client-side fetch with automatic retry + timeout for transient failures.
//
// The API is a Cloudflare Worker on a different origin. During a deploy, a cold
// start, or a brief network blip the browser sees either a thrown TypeError
// ("Failed to fetch") or a 5xx/429 response. Rather than flash an error at the
// user, we retry a few times with backoff — by the time the retries finish the
// worker is almost always answering again.
//
// Retry policy (safe against double-submits):
//   - Network error (request never reached the server) → retry ANY method.
//   - 502 / 503 / 504 / 429 (gateway/unavailable/rate-limit; the route handler
//     did not run) → retry ANY method.
//   - 500 (handler ran and threw; a write may have taken effect) → retry GET only.
//   - Our own timeout abort → retry GET only (a slow write might have committed).
//   - Caller-initiated abort (their own signal) → never retried; propagated.
const RETRY_ANY_METHOD = new Set([429, 502, 503, 504]);
const RETRY_GET_ONLY = new Set([500]);

export async function retryFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: { retries?: number; backoffMs?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;      // one automatic retry, plus a backup, on transient failures
  const backoff = opts.backoffMs ?? 700;
  const timeoutMs = opts.timeoutMs ?? 10000; // 10s AbortController deadline per attempt
  const method = (init.method ?? "GET").toUpperCase();
  const isGet = method === "GET";
  const callerSignal = init.signal ?? undefined;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    // Fold the caller's own abort signal into ours so cancellation still works.
    if (callerSignal) {
      if (callerSignal.aborted) ctrl.abort();
      else callerSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    try {
      const res = await fetch(input, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      const retryable = RETRY_ANY_METHOD.has(res.status) || (isGet && RETRY_GET_ONLY.has(res.status));
      if (retryable && attempt < retries) { await sleep(backoff * (attempt + 1)); continue; }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      // The caller cancelled on purpose — don't fight it.
      if (callerSignal?.aborted) throw e;
      const isTimeout = e instanceof Error && e.name === "AbortError";
      // Timeout → replay reads only; genuine network error → replay any method.
      const canRetry = isTimeout ? isGet : true;
      if (canRetry && attempt < retries) { await sleep(backoff * (attempt + 1)); continue; }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Network request failed");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
