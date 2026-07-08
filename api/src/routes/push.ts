// Web Push subscriptions + test send.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, type AuthVars } from '../middleware/auth'
import { notifyUser } from '../lib/webpush'

const push = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// The VAPID public key the browser needs to subscribe (not secret).
push.get('/key', (c) => c.json({ key: c.env.VAPID_PUBLIC_KEY ?? '' }))

push.post('/subscribe', requireAuth, async (c) => {
  const u = c.get('user')
  const b = await c.req.json().catch(() => ({}))
  const endpoint = b?.endpoint as string | undefined
  const p256dh = b?.keys?.p256dh as string | undefined
  const auth = b?.keys?.auth as string | undefined
  if (!endpoint || !p256dh || !auth) return c.json({ error: 'invalid subscription' }, 400)
  const prisma = getPrisma(c.env.DB)
  // endpoint is globally @unique, so guard the update branch: don't let a caller take over a
  // device endpoint registered to another user by supplying it. Only the owner may re-bind. #tenant-isolation
  const owner = await prisma.pushSubscription.findUnique({ where: { endpoint }, select: { userId: true } })
  if (owner && owner.userId !== u.sub) return c.json({ error: 'endpoint already registered to another user' }, 409)
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, userId: u.sub, tenantId: u.tenant ?? null },
    update: { userId: u.sub, tenantId: u.tenant ?? null, p256dh, auth },
  })
  return c.json({ ok: true })
})

push.post('/unsubscribe', requireAuth, async (c) => {
  const u = c.get('user')
  const b = await c.req.json().catch(() => ({}))
  // Scope the delete to the caller's own subscription so a stolen endpoint can't be used to
  // unsubscribe someone else's device. deleteMany no-ops when the endpoint isn't theirs. #tenant-isolation
  if (b?.endpoint) { const prisma = getPrisma(c.env.DB); await prisma.pushSubscription.deleteMany({ where: { endpoint: b.endpoint, userId: u.sub } }) }
  return c.json({ ok: true })
})

// Send a test push to the current user's devices.
push.post('/test', requireAuth, async (c) => {
  const u = c.get('user')
  const sent = await notifyUser(c.env, u.sub, { title: 'LabSynch', body: 'Test notification — it works! 🎉', url: '/dashboard' })
  return c.json({ ok: true, sent })
})

export default push
