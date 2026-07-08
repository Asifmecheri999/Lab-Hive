// Timeout helpers for the Cloudflare Workers runtime.
//
// Neither D1/Prisma queries nor fetch() have a built-in deadline, so a single slow
// dependency (D1 under write contention, a sluggish email/AI/push provider) can hang
// a whole request until the Worker is force-killed. These bound the wait so a slow
// moment becomes a fast, catchable error the caller can handle or retry — instead of
// an indefinite hang.

// Race a promise against a deadline. On timeout it rejects; the underlying work keeps
// running (harmless) but we stop waiting on it. The timer is cleared once the race
// settles so we never leave a dangling rejection.
export function withTimeout<T>(p: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms) })
  return Promise.race([p, deadline]).finally(() => { if (timer) clearTimeout(timer) }) as Promise<T>
}

// fetch() with an AbortController deadline. Use for every call to an EXTERNAL service
// (email, AI, web push) so a slow provider can't hold the request open.
export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}
