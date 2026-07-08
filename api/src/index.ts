import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './lib/db'
import { getPrisma } from './lib/db'
import type { AuthVars } from './middleware/auth'
import auth from './routes/auth'
import inventory from './routes/inventory'
import schedule from './routes/schedule'
import requests from './routes/requests'
import safety from './routes/safety'
import procurement from './routes/procurement'
import capex from './routes/capex'
import finance from './routes/finance'
import vendors from './routes/vendors'
import maintenance from './routes/maintenance'
import docs from './routes/docs'
import users from './routes/users'
import agent from './routes/agent'
import files from './routes/files'
import org from './routes/org'
import experiments from './routes/experiments'
import subjects from './routes/subjects'
import timetable from './routes/timetable'
import faculty from './routes/faculty'
import activities from './routes/activities'
import issuances from './routes/issuances'
import portal from './routes/portal'
import comments from './routes/comments'
import contact from './routes/contact'
import push from './routes/push'
import tenants from './routes/tenants'
import { runTrialReminders } from './lib/subscriptions'

const app = new Hono<{ Bindings: Env; Variables: AuthVars }>()

app.use('*', logger())
app.use(
  '*',
  cors({
    // Reflect the caller's origin so the app works on workers.dev and the custom domain (labsynch).
    // Auth is via Bearer tokens (not cookies), so reflecting origins is safe here.
    origin: (origin) => origin ?? '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
)

// Global error handler — Hono routes every unhandled throw from any route/middleware
// here, so this is the single catch-all: it (1) logs a structured, greppable line with
// enough context to debug (method, path, tenant, user, message, stack), (2) maps the
// error to a sensible status (a query/fetch timeout → 504 so the client can retry;
// anything else → 500), and (3) re-attaches the CORS header. Without the header a raw
// 500 gets mislabeled by the browser as a CORS error, masking the real cause.
app.onError((err, c) => {
  const e = err as Error
  const user = c.get('user') as { tenant?: string; sub?: string } | undefined
  const isTimeout = /timed out/i.test(e?.message ?? '')
  console.error(JSON.stringify({
    level: 'error',
    msg: 'Unhandled API error',
    method: c.req.method,
    path: c.req.path,
    tenant: user?.tenant ?? null,
    userId: user?.sub ?? null,
    error: e?.message ?? String(err),
    stack: e?.stack ?? null,
  }))
  const status = isTimeout ? 504 : 500
  const origin = c.req.header('Origin')
  const res = c.json({
    status: 'error',
    message: isTimeout ? 'The server took too long to respond — please try again.' : (e?.message || 'Internal server error'),
  }, status)
  if (origin) res.headers.set('Access-Control-Allow-Origin', origin)
  return res
})

app.get('/', (c) => c.json({ status: 'Lab Hive API running' }))

// Health check that also verifies the D1 connection
app.get('/api/health', async (c) => {
  try {
    const prisma = getPrisma(c.env.DB)
    const users = await prisma.user.count()
    return c.json({ status: 'ok', db: 'connected', users })
  } catch (err) {
    return c.json({ status: 'error', message: (err as Error).message }, 500)
  }
})

// Module routes
app.route('/api/auth', auth)
app.route('/api/inventory', inventory)
app.route('/api/schedule', schedule)
app.route('/api/requests', requests)
app.route('/api/safety', safety)
app.route('/api/procurement', procurement)
app.route('/api/capex', capex)
app.route('/api/finance', finance)
app.route('/api/vendors', vendors)
app.route('/api/maintenance', maintenance)
app.route('/api/docs', docs)
app.route('/api/users', users)
app.route('/api/agent', agent)
app.route('/api/files', files)
app.route('/api/org', org)
app.route('/api/experiments', experiments)
app.route('/api/subjects', subjects)
app.route('/api/timetable', timetable)
app.route('/api/faculty', faculty)
app.route('/api/activities', activities)
app.route('/api/issuances', issuances)
app.route('/api/portal-requests', portal)
app.route('/api/comments', comments)
app.route('/api/contact', contact)
app.route('/api/push', push)
app.route('/api/tenants', tenants)

// Exported for tests (Vitest) so route handlers can be exercised with `app.request(...)`.
export { app }

// Daily cron — trial reminders + auto-expire.
export default {
  fetch: app.fetch,
  scheduled: (_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) => {
    ctx.waitUntil(runTrialReminders(env))
  },
}
