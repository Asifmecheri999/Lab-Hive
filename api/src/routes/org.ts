// Organisation hierarchy: Campus → School → Department. Tenant-scoped, plan-limited.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, planLimit, PLAN_LIMITS, type AuthVars } from '../middleware/auth'
import { detectProvider } from '../lib/ai'

const org = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// Overview: hierarchy + plan usage vs limits.
org.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const t = u.tenant
  const [campuses, schools, departments, labs, inventory, users, tenant] = await Promise.all([
    prisma.campus.findMany({ where: { tenantId: t }, orderBy: { name: 'asc' } }),
    prisma.school.findMany({ where: { tenantId: t }, orderBy: { name: 'asc' } }),
    prisma.department.findMany({ where: { tenantId: t }, orderBy: { name: 'asc' } }),
    prisma.lab.count({ where: { tenantId: t } }),
    prisma.inventoryItem.count({ where: { tenantId: t } }),
    prisma.user.count({ where: { tenantId: t } }),
    t ? prisma.tenant.findUnique({ where: { id: t } }) : null,
  ])
  // During an active trial everything is unlimited; otherwise the plan's caps apply.
  const onTrial = u.status === 'trial'
  const UNLIMITED = { campuses: null, schools: null, departments: null, labs: null, inventory: null, users: null, experiments: null }
  const limits = onTrial ? UNLIMITED : (PLAN_LIMITS[u.plan ?? 'FREE'] ?? PLAN_LIMITS.FREE)
  // Never ship the raw AI key to the browser — only whether it's set.
  const safeTenant = tenant ? { ...tenant, aiApiKey: undefined, aiEnabled: !!tenant.aiApiKey, aiProvider: detectProvider(tenant.aiApiKey) } : null
  return c.json({
    plan: u.plan ?? 'FREE',
    status: u.status ?? null,
    onTrial,
    tenant: safeTenant,
    campuses, schools, departments,
    usage: { campuses: campuses.length, schools: schools.length, departments: departments.length, labs, inventory, users },
    limits,
  })
})

async function guard(prisma: ReturnType<typeof getPrisma>, plan: string | undefined, tenantId: string | undefined, kind: 'campuses' | 'schools' | 'departments', status?: string) {
  const limit = planLimit(plan, kind, status)
  if (limit == null) return null
  const table = kind === 'campuses' ? prisma.campus : kind === 'schools' ? prisma.school : prisma.department
  const count = await table.count({ where: { tenantId } })
  if (count >= limit) return `Plan limit reached (${limit} ${kind}). Upgrade to add more.`
  return null
}

org.post('/campuses', requireRole('ADMIN'), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.name) return c.json({ error: 'name is required' }, 400)
  const err = await guard(prisma, u.plan, u.tenant, 'campuses', u.status)
  if (err) return c.json({ error: err }, 403)
  return c.json(await prisma.campus.create({ data: { tenantId: u.tenant, name: b.name, location: b.location } }), 201)
})

org.post('/schools', requireRole('ADMIN'), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.name) return c.json({ error: 'name is required' }, 400)
  const err = await guard(prisma, u.plan, u.tenant, 'schools', u.status)
  if (err) return c.json({ error: err }, 403)
  return c.json(await prisma.school.create({ data: { tenantId: u.tenant, campusId: b.campusId, name: b.name } }), 201)
})

org.post('/departments', requireRole('ADMIN'), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.name) return c.json({ error: 'name is required' }, 400)
  const err = await guard(prisma, u.plan, u.tenant, 'departments', u.status)
  if (err) return c.json({ error: err }, 403)
  return c.json(await prisma.department.create({ data: { tenantId: u.tenant, schoolId: b.schoolId, name: b.name, code: b.code } }), 201)
})

// Departments list (for pickers) — any signed-in user
org.get('/departments', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  return c.json(await prisma.department.findMany({ where: { tenantId: u.tenant }, orderBy: { name: 'asc' } }))
})

// Schools list (for pickers) — any signed-in user
org.get('/schools', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  return c.json(await prisma.school.findMany({ where: { tenantId: u.tenant }, orderBy: { name: 'asc' } }))
})

// Faculty (supervisor) list for student/faculty forms — name + email only.
org.get('/supervisors', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const list = await prisma.user.findMany({ where: { tenantId: u.tenant, role: 'FACULTY' }, select: { name: true, email: true }, orderBy: { name: 'asc' } })
  return c.json(list)
})

// Set the fiscal-year start month (1-12). Instant + reversible — only changes how Finance groups dates.
org.patch('/settings', requireRole('ADMIN'), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  if (!u.tenant) return c.json({ error: 'No workspace' }, 400)
  const b = await c.req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (b.fiscalYearStartMonth !== undefined) {
    const m = Number(b.fiscalYearStartMonth)
    if (!Number.isInteger(m) || m < 1 || m > 12) return c.json({ error: 'fiscalYearStartMonth must be 1-12' }, 400)
    data.fiscalYearStartMonth = m
  }
  // Accept any key as-is (empty string clears it) — the Test button verifies it live.
  if (b.aiApiKey !== undefined) data.aiApiKey = b.aiApiKey ? String(b.aiApiKey).trim() : null
  if (b.defaultApproverEmail !== undefined) data.defaultApproverEmail = b.defaultApproverEmail || null
  if (b.defaultApproverName !== undefined) data.defaultApproverName = b.defaultApproverName || null
  if (b.allowedEmailDomains !== undefined) data.allowedEmailDomains = b.allowedEmailDomains ? String(b.allowedEmailDomains).split(',').map((d) => d.trim().replace(/^@+/, '')).filter(Boolean).join(',') : null
  const t = await prisma.tenant.update({ where: { id: u.tenant }, data })
  return c.json({ ...t, aiApiKey: undefined, aiEnabled: !!t.aiApiKey, aiProvider: detectProvider(t.aiApiKey) })
})

// Edit a campus / school / department
org.put('/:kind/:id', requireRole('ADMIN'), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const kind = c.req.param('kind'); const id = c.req.param('id')
  const b = await c.req.json()
  try {
    if (kind === 'campuses') {
      const ex = await prisma.campus.findUnique({ where: { id }, select: { tenantId: true } })
      if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
      return c.json(await prisma.campus.update({ where: { id }, data: { ...(b.name != null ? { name: b.name } : {}), ...('location' in b ? { location: b.location || null } : {}) } }))
    }
    if (kind === 'schools') {
      const ex = await prisma.school.findUnique({ where: { id }, select: { tenantId: true } })
      if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
      return c.json(await prisma.school.update({ where: { id }, data: { ...(b.name != null ? { name: b.name } : {}), ...('campusId' in b ? { campusId: b.campusId || null } : {}) } }))
    }
    if (kind === 'departments') {
      const ex = await prisma.department.findUnique({ where: { id }, select: { tenantId: true } })
      if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
      return c.json(await prisma.department.update({ where: { id }, data: { ...(b.name != null ? { name: b.name } : {}), ...('schoolId' in b ? { schoolId: b.schoolId || null } : {}), ...('code' in b ? { code: b.code || null } : {}) } }))
    }
    return c.json({ error: 'bad kind' }, 400)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// Delete a campus / school / department (blocks if it still has children)
org.delete('/:kind/:id', requireRole('ADMIN'), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const kind = c.req.param('kind'); const id = c.req.param('id')
  try {
    if (kind === 'campuses') {
      const ex = await prisma.campus.findUnique({ where: { id }, select: { tenantId: true } })
      if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
      if (await prisma.school.count({ where: { campusId: id } })) return c.json({ error: 'Remove its schools first.' }, 400)
      await prisma.campus.delete({ where: { id } })
    } else if (kind === 'schools') {
      const ex = await prisma.school.findUnique({ where: { id }, select: { tenantId: true } })
      if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
      if (await prisma.department.count({ where: { schoolId: id } })) return c.json({ error: 'Remove its departments first.' }, 400)
      await prisma.school.delete({ where: { id } })
    } else if (kind === 'departments') {
      const ex = await prisma.department.findUnique({ where: { id }, select: { tenantId: true } })
      if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
      await prisma.department.delete({ where: { id } })
    } else return c.json({ error: 'bad kind' }, 400)
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Delete failed' }, 400)
  }
})

// DANGER: wipe ALL data for the current tenant (keeps user accounts) — for a clean start.
org.post('/reset', requireRole('ADMIN'), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const t = c.get('user').tenant
  // 1) rows that reference inventory / labs / requests
  await prisma.stockMovement.deleteMany({ where: { tenantId: t } })
  await prisma.maintenanceLog.deleteMany({ where: { tenantId: t } })
  await prisma.maintenanceSchedule.deleteMany({ where: { tenantId: t } })
  await prisma.labSession.deleteMany({ where: { tenantId: t } })
  await prisma.timetableEntry.deleteMany({ where: { tenantId: t } })
  await prisma.approval.deleteMany({ where: { tenantId: t } })
  await prisma.pPERequest.deleteMany({ where: { tenantId: t } })
  await prisma.safetyDocument.deleteMany({ where: { tenantId: t } })
  await prisma.document.deleteMany({ where: { tenantId: t } })
  // 2) parents that cascade their line-item children
  await prisma.activity.deleteMany({ where: { tenantId: t } })
  await prisma.issuance.deleteMany({ where: { tenantId: t } })
  await prisma.experiment.deleteMany({ where: { tenantId: t } })
  await prisma.procurementRequest.deleteMany({ where: { tenantId: t } })
  await prisma.capexAsset.deleteMany({ where: { tenantId: t } })
  await prisma.opexExpense.deleteMany({ where: { tenantId: t } })
  await prisma.budgetLine.deleteMany({ where: { tenantId: t } })
  await prisma.serviceRequest.deleteMany({ where: { tenantId: t } })
  await prisma.subject.deleteMany({ where: { tenantId: t } })
  await prisma.faculty.deleteMany({ where: { tenantId: t } })
  await prisma.term.deleteMany({ where: { tenantId: t } })
  // 3) inventory, labs, vendors
  await prisma.inventoryItem.deleteMany({ where: { tenantId: t } })
  await prisma.lab.deleteMany({ where: { tenantId: t } })
  await prisma.vendor.deleteMany({ where: { tenantId: t } })
  // 4) org hierarchy
  await prisma.department.deleteMany({ where: { tenantId: t } })
  await prisma.school.deleteMany({ where: { tenantId: t } })
  await prisma.campus.deleteMany({ where: { tenantId: t } })
  return c.json({ ok: true })
})

export default org
