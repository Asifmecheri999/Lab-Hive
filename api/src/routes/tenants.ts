// Platform-owner control panel: manage all customer organisations (tenants).
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireSuperAdmin, type AuthVars } from '../middleware/auth'
import { hashPassword } from '../lib/auth'
import { sendEmail, mailLayout, mailButton, mailPanel } from '../lib/email'
import { runTrialReminders } from '../lib/subscriptions'

const APP_URL = 'https://labsynch.com'
const PLANS = ['FREE', 'SCHOOL', 'ENTERPRISE', 'MULTICAMPUS']
const tenants = new Hono<{ Bindings: Env; Variables: AuthVars }>()
tenants.use('*', requireSuperAdmin)

function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const a = crypto.getRandomValues(new Uint32Array(12))
  let s = ''; for (const n of a) s += chars[n % chars.length]; return s
}

// List every organisation with its user count + owner.
tenants.get('/', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const list = await prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } })
  const users = await prisma.user.findMany({ select: { tenantId: true } })
  const count: Record<string, number> = {}
  for (const u of users) count[u.tenantId ?? ''] = (count[u.tenantId ?? ''] ?? 0) + 1
  return c.json(list.map((t) => ({ ...t, users: count[t.id] ?? 0 })))
})

// Create an organisation + its owner-admin, email them a welcome with temp credentials.
tenants.post('/', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const b = await c.req.json().catch(() => ({}))
  if (!b.orgName || !b.ownerEmail || !b.ownerName) return c.json({ error: 'orgName, ownerName and ownerEmail are required' }, 400)
  const plan = PLANS.includes(b.plan) ? b.plan : 'ENTERPRISE' // free build: default to full access
  const email = String(b.ownerEmail).toLowerCase()
  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return c.json({ error: 'A user with that email already exists' }, 409)
  const trialEndsAt = b.trialEndsAt ? new Date(b.trialEndsAt) : new Date(Date.now() + (Number(b.trialDays) || 30) * 86400000)
  // 'active' (not 'trial') so a workspace never auto-expires or gets locked out — it's free forever.
  const tenant = await prisma.tenant.create({ data: { name: b.orgName, plan, status: 'active', trialEndsAt, ownerEmail: email } })
  const pw = tempPassword()
  await prisma.user.create({ data: { tenantId: tenant.id, email, name: b.ownerName, role: 'ADMIN', passwordHash: await hashPassword(pw), mustResetPassword: true } })
  await sendEmail(c.env, {
    to: email,
    subject: 'Welcome to LabSynch — your workspace is ready',
    html: mailLayout('Welcome to LabSynch', `<p style="margin:0 0 4px;">Hi ${b.ownerName},</p><p style="margin:0;">Your LabSynch workspace <b>${b.orgName}</b> is ready. Here are your sign-in details:</p>${mailPanel(`<b>Email:</b> ${email}<br/><b>Temporary password:</b> ${pw}`)}${mailButton(`${APP_URL}/login`, 'Sign in to LabSynch')}<p style="margin:0;color:#64748b;">You'll be asked to set your own password on first sign-in. It's free, with full access to every module.</p>`, `Your LabSynch workspace ${b.orgName} is ready`),
    text: `Welcome to LabSynch. Sign in at ${APP_URL}/login\nEmail: ${email}\nTemporary password: ${pw}\nYou'll set your own password on first sign-in. It's free, with full access.`,
  })
  return c.json({ ...tenant, tempPassword: pw }, 201)
})

// Update plan / status / trial end / name.
tenants.patch('/:id', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const b = await c.req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (b.name) data.name = b.name
  if (b.plan && PLANS.includes(b.plan)) data.plan = b.plan
  if (b.status) data.status = b.status
  if (b.trialEndsAt !== undefined) data.trialEndsAt = b.trialEndsAt ? new Date(b.trialEndsAt) : null
  if (b.notes !== undefined) data.notes = b.notes || null
  if (b.attachments !== undefined) data.attachments = Array.isArray(b.attachments) ? JSON.stringify(b.attachments) : (b.attachments ?? null)
  if (b.payments !== undefined) data.payments = Array.isArray(b.payments) ? JSON.stringify(b.payments) : (b.payments ?? null)
  try { return c.json(await prisma.tenant.update({ where: { id: c.req.param('id') }, data })) }
  catch { return c.json({ error: 'Not found' }, 404) }
})

// Reset the owner's password (new temp + email + force reset).
tenants.post('/:id/resend', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const t = await prisma.tenant.findUnique({ where: { id: c.req.param('id') } })
  if (!t || !t.ownerEmail) return c.json({ error: 'Not found' }, 404)
  const pw = tempPassword()
  await prisma.user.update({ where: { email: t.ownerEmail }, data: { passwordHash: await hashPassword(pw), mustResetPassword: true } })
  await sendEmail(c.env, {
    to: t.ownerEmail,
    subject: 'Your LabSynch sign-in details',
    html: mailLayout('Your sign-in details', `<p style="margin:0;">Here are the sign-in details for <b>${t.name}</b>:</p>${mailPanel(`<b>Email:</b> ${t.ownerEmail}<br/><b>Temporary password:</b> ${pw}`)}${mailButton(`${APP_URL}/login`, 'Sign in to LabSynch')}<p style="margin:0;color:#64748b;">You'll set your own password on first sign-in.</p>`, `Sign-in details for ${t.name}`),
    text: `Sign in at ${APP_URL}/login\nEmail: ${t.ownerEmail}\nTemporary password: ${pw}`,
  })
  return c.json({ ok: true, tempPassword: pw })
})

// Permanently delete an organisation and ALL of its data — super-admin only, name-confirmed.
// Only rows tagged with this tenantId are touched, so other organisations are never affected.
tenants.delete('/:id', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const id = c.req.param('id')
  const me = c.get('user')
  if (me.tenant === id) return c.json({ error: "You can't delete your own workspace" }, 400)
  const tenant = await prisma.tenant.findUnique({ where: { id } })
  if (!tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json().catch(() => ({}))
  if (String(b.confirm ?? '').trim() !== tenant.name) return c.json({ error: 'Type the organisation name exactly to confirm' }, 400)

  // Find every tenant-scoped table dynamically (covers current + future models), delete only this tenant's rows.
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE '_prisma%'`)
  let pending: string[] = []
  for (const { name } of tables) {
    const cols = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${name}")`)
    if (cols.some((col) => col.name === 'tenantId')) pending.push(name)
  }
  // Retry passes resolve any foreign-key ordering between this tenant's own rows.
  for (let pass = 0; pass < 4 && pending.length; pass++) {
    const still: string[] = []
    for (const name of pending) {
      try { await prisma.$executeRawUnsafe(`DELETE FROM "${name}" WHERE "tenantId" = ?`, id) }
      catch { still.push(name) }
    }
    pending = still
  }
  await prisma.tenant.delete({ where: { id } })
  return c.json({ ok: true })
})

// Run the trial reminders / expiry job now (for testing; also runs daily via cron).
tenants.post('/run-reminders', async (c) => c.json(await runTrialReminders(c.env)))

export default tenants
