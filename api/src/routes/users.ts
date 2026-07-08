// User management — ADMIN only (create/list/update role). Passwords hashed with PBKDF2.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireRole, type AuthVars } from '../middleware/auth'
import { hashPassword } from '../lib/auth'
import { sendEmail, mailLayout, mailButton, mailPanel } from '../lib/email'

const APP_URL = 'https://labsynch.com'

const ROLES = [
  'STUDENT', 'FACULTY', 'LAB_TECHNICIAN', 'LAB_COORDINATOR',
  'LAB_MANAGER', 'HEAD_OF_SCHOOL', 'DEAN', 'ADMIN',
]
const users = new Hono<{ Bindings: Env; Variables: AuthVars }>()

users.use('*', requireRole('ADMIN'))

// Enforce the tenant's allowed email domains (if the admin has set any).
function domainOk(email: string, allowed: string | null | undefined): boolean {
  const list = (allowed ?? '').split(',').map((d) => d.trim().toLowerCase().replace(/^@+/, '')).filter(Boolean)
  if (!list.length) return true // no restriction configured → any domain
  const dom = String(email).toLowerCase().split('@')[1] ?? ''
  return list.some((d) => dom === d || dom.endsWith('.' + d))
}
async function checkDomain(c: { env: Env; get: (k: 'user') => AuthVars['user'] }, email: string): Promise<string | null> {
  const prisma = getPrisma(c.env.DB)
  const t = await prisma.tenant.findUnique({ where: { id: c.get('user').tenant ?? '__none__' }, select: { allowedEmailDomains: true } })
  if (domainOk(email, t?.allowedEmailDomains)) return null
  return `Email domain not allowed. Users must use one of: ${t?.allowedEmailDomains}`
}

users.get('/', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const list = await prisma.user.findMany({
    where: { tenantId: u.tenant },
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, name: true, role: true, isApprover: true, campus: true, school: true, department: true, studentId: true, createdAt: true },
  })
  return c.json(list)
})

users.post('/', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const b = await c.req.json()
  if (!b.email || !b.name || !b.password) {
    return c.json({ error: 'email, name and password are required' }, 400)
  }
  if (b.role && !ROLES.includes(b.role)) return c.json({ error: 'invalid role' }, 400)
  const domErr = await checkDomain(c, String(b.email))
  if (domErr) return c.json({ error: domErr }, 400)
  const passwordHash = await hashPassword(b.password)
  const actor = c.get('user')
  try {
    const u = await prisma.user.create({
      data: {
        tenantId: actor.tenant,
        email: String(b.email).toLowerCase(),
        name: b.name,
        role: b.role ?? 'STUDENT',
        isApprover: !!b.isApprover,
        campus: b.campus ?? null,
        school: b.school ?? null,
        department: b.department,
        studentId: b.studentId,
        passwordHash,
      },
      select: { id: true, email: true, name: true, role: true },
    })
    // Welcome email with their credentials + sign-in link.
    if (b.notify !== false) {
      await sendEmail(c.env, {
        to: u.email,
        subject: 'Your LabSynch account is ready',
        html: mailLayout('Welcome to LabSynch', `<p style="margin:0 0 4px;">Hi ${u.name},</p><p style="margin:0;">An account has been created for you on <b>LabSynch</b>, your lab operations platform. Here are your sign-in details:</p>${mailPanel(`<b>Email:</b> ${u.email}<br/><b>Temporary password:</b> ${String(b.password)}`)}${mailButton(`${APP_URL}/login`, 'Sign in to LabSynch')}<p style="margin:0;color:#64748b;">For your security, please change your password after signing in — you can use “Forgot password?” on the sign-in page at any time.</p>`, 'Your LabSynch account is ready'),
        text: `Welcome to LabSynch. Sign in at ${APP_URL}/login\nEmail: ${u.email}\nTemporary password: ${String(b.password)}\nPlease change it after signing in.`,
      })
    }
    return c.json(u, 201)
  } catch {
    return c.json({ error: 'Email already exists' }, 409)
  }
})

// Full update — name, role, department, staff/student id.
users.put('/:id', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const actor = c.get('user')
  const b = await c.req.json()
  if (!b.name) return c.json({ error: 'name is required' }, 400)
  if (b.role && !ROLES.includes(b.role)) return c.json({ error: 'invalid role' }, 400)
  if (b.email) { const domErr = await checkDomain(c, String(b.email)); if (domErr) return c.json({ error: domErr }, 400) }
  const ex = await prisma.user.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== actor.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    const u = await prisma.user.update({
      where: { id: c.req.param('id') },
      data: {
        name: b.name,
        ...(b.role ? { role: b.role } : {}),
        ...(b.isApprover !== undefined ? { isApprover: !!b.isApprover } : {}),
        campus: b.campus ?? null,
        school: b.school ?? null,
        department: b.department ?? null,
        studentId: b.studentId ?? null,
        ...(b.email ? { email: String(b.email).toLowerCase() } : {}),
        ...(b.password ? { passwordHash: await hashPassword(b.password) } : {}),
      },
      select: { id: true, email: true, name: true, role: true, campus: true, school: true, department: true, studentId: true },
    })
    return c.json(u)
  } catch {
    return c.json({ error: 'Update failed (email may already exist, or user not found)' }, 409)
  }
})

users.delete('/:id', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const actor = c.get('user')
  const id = c.req.param('id')
  if (id === actor.sub) return c.json({ error: "You can't delete your own account" }, 400)
  const ex = await prisma.user.findUnique({ where: { id }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== actor.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    await prisma.user.delete({ where: { id } })
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

users.patch('/:id/role', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const actor = c.get('user')
  const { role } = await c.req.json()
  if (!ROLES.includes(role)) return c.json({ error: 'invalid role' }, 400)
  const ex = await prisma.user.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== actor.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    const u = await prisma.user.update({
      where: { id: c.req.param('id') },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    })
    return c.json(u)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

export default users
