// Server-persisted notifications for the bell + sidebar. Source of truth for "unread" state,
// so clearing the bell survives logout/login (no more localStorage-only dismissal).
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, type AuthVars } from '../middleware/auth'

const notifications = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// List my notifications (most recent first) + how many are unread.
notifications.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const items = await prisma.notification.findMany({
    where: { userId: u.sub },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const unread = items.filter((n) => !n.readAt).length
  return c.json({ items, unread })
})

// Just the unread count — cheap poll for the bell badge + sidebar.
notifications.get('/count', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const unread = await prisma.notification.count({ where: { userId: u.sub, readAt: null } })
  return c.json({ unread })
})

// Mark everything read (bell "Clear"). Persists — the unread badge stays gone after re-login.
notifications.post('/read-all', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  await prisma.notification.updateMany({ where: { userId: u.sub, readAt: null }, data: { readAt: new Date() } })
  return c.json({ ok: true })
})

// Mark read every notification tied to one request (called when the user opens that
// request's tile / detail). This is how the bell clears once an alert is "dealt with".
notifications.post('/read-ref', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const { refType, refId } = await c.req.json().catch(() => ({}))
  if (!refId) return c.json({ error: 'refId is required' }, 400)
  await prisma.notification.updateMany({
    where: { userId: u.sub, refId: String(refId), ...(refType ? { refType: String(refType) } : {}), readAt: null },
    data: { readAt: new Date() },
  })
  return c.json({ ok: true })
})

// Mark read every notification pointing at a section (by url prefix, e.g. "/approvals" or
// "/procurement"). Called when the user opens that page — clears that section's bell badge.
notifications.post('/read-url', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const { urlPrefix } = await c.req.json().catch(() => ({}))
  if (!urlPrefix) return c.json({ error: 'urlPrefix is required' }, 400)
  await prisma.notification.updateMany({
    where: { userId: u.sub, url: { startsWith: String(urlPrefix) }, readAt: null },
    data: { readAt: new Date() },
  })
  return c.json({ ok: true })
})

// Mark one read (e.g. when the user clicks through to the request).
notifications.post('/:id/read', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  await prisma.notification.updateMany({ where: { id: c.req.param('id'), userId: u.sub }, data: { readAt: new Date() } })
  return c.json({ ok: true })
})

// Dismiss (delete) one notification.
notifications.delete('/:id', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  await prisma.notification.deleteMany({ where: { id: c.req.param('id'), userId: u.sub } })
  return c.json({ ok: true })
})

// Clear the whole list (delete all mine).
notifications.delete('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  await prisma.notification.deleteMany({ where: { userId: u.sub } })
  return c.json({ ok: true })
})

export default notifications
