// Lab Hive DB package — re-exports the generated Prisma client and a D1 factory.
import { PrismaClient } from './generated/prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'

export * from './generated/prisma/client'
export { PrismaClient }

// Hard ceiling for any single query. D1/Prisma have no built-in per-query deadline, so a
// slow or contended database could otherwise hang a whole Worker request until it is
// force-killed. 8s is far above a healthy query yet low enough that a hung one fails fast
// (surfacing as a clean 504 the client can retry) instead of freezing the request.
const QUERY_TIMEOUT_MS = 8000

// Wrap a query promise in a timeout, clearing the timer once it settles so we never leak
// a pending rejection. Inlined here (this package can't import the API's helpers).
function raceTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Database ${label} timed out after ${QUERY_TIMEOUT_MS}ms`)), QUERY_TIMEOUT_MS)
  })
  return Promise.race([p, deadline]).finally(() => { if (timer) clearTimeout(timer) }) as Promise<T>
}

// Reuse ONE Prisma client per D1 binding. Building a PrismaClient (which spins up a query
// engine) on every request is CPU-heavy; under the app-shell's parallel request burst that
// thrashing pushes the Worker past its limits and the runtime kills requests (surfacing as
// edge 504s with no CORS header). The Workers isolate and its D1 binding are stable across
// requests, so a WeakMap keyed by the binding reuses the same client — and if the binding is
// ever a different object, it simply builds a fresh one (so this can never use a stale handle).
// A client extension applies the query timeout to EVERY operation automatically.
const clientCache = new WeakMap<D1Database, PrismaClient>()

export function getPrisma(d1: D1Database): PrismaClient {
  const cached = clientCache.get(d1)
  if (cached) return cached
  const base = new PrismaClient({ adapter: new PrismaD1(d1) })
  const extended = base.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        return raceTimeout(query(args), `${model ?? 'raw'}.${operation}`)
      },
    },
  }) as unknown as PrismaClient
  clientCache.set(d1, extended)
  return extended
}
