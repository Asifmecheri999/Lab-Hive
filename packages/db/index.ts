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

// Build a request-scoped Prisma client bound to a Cloudflare D1 binding.
// (Per-request client is the correct Workers pattern — no long-lived pool.)
// A client extension applies the query timeout to EVERY operation automatically, so no
// call-site needs to remember it.
export function getPrisma(d1: D1Database): PrismaClient {
  const base = new PrismaClient({ adapter: new PrismaD1(d1) })
  const extended = base.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        return raceTimeout(query(args), `${model ?? 'raw'}.${operation}`)
      },
    },
  })
  return extended as unknown as PrismaClient
}
