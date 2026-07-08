// Experiments — required resources (equipment/tools/consumables) + cost per group.
// Read: any logged-in user (tenant-scoped). Write: lab team / faculty (+admin).
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, planLimit, type AuthVars } from '../middleware/auth'
import { adjustConsumption } from '../lib/stock'

const WRITE = [...LAB_TEAM, 'FACULTY'] // LAB_TEAM already includes ADMIN
const experiments = new Hono<{ Bindings: Env; Variables: AuthVars }>()

type Line = { itemId: string; quantity?: number; consumed?: boolean; unit?: string }

// Cost per group = sum over consumed items of qty * the rate for the chosen unit (piece/box).
function costPerGroup(items: { quantity: number; consumed: boolean; unit?: string | null; item: { pricePerPiece: number | null; pricePerBox?: number | null } }[]) {
  return items.filter((i) => i.consumed).reduce((t, i) => {
    const rate = i.unit === 'BOX' ? (i.item.pricePerBox ?? 0) : (i.item.pricePerPiece ?? 0)
    return t + i.quantity * rate
  }, 0)
}

// Never trust body-supplied itemIds: an experiment line could reference another tenant's
// InventoryItem, which would then leak that item's fields back through the item include on
// read. Keep only lines whose item provably belongs to the caller's tenant. #tenant-isolation
async function ownedItemLines(prisma: ReturnType<typeof getPrisma>, lines: Line[], tenant?: string): Promise<Line[]> {
  if (!lines.length || !tenant) return []
  const ids = [...new Set(lines.map((l) => l.itemId))]
  const owned = new Set(
    (await prisma.inventoryItem.findMany({ where: { id: { in: ids }, tenantId: tenant }, select: { id: true } })).map((i) => i.id),
  )
  return lines.filter((l) => owned.has(l.itemId))
}

experiments.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const labId = c.req.query('labId')
  const subjectId = c.req.query('subjectId')
  const rows = await prisma.experiment.findMany({
    where: { tenantId: u.tenant, ...(labId ? { labId } : {}), ...(subjectId ? { subjectId } : {}) },
    orderBy: { title: 'asc' },
    include: {
      lab: { select: { name: true } },
      subject: { select: { name: true, code: true } },
      items: { include: { item: { select: {
        name: true, type: true, unit: true, pricePerPiece: true, pricePerBox: true,
        riskAssessmentUrl: true, experimentManualUrl: true, safetyOperatingProcedureUrl: true,
        standardOperatingProcedureUrl: true, equipmentManualUrl: true, maintenanceLogUrl: true, extraDocuments: true,
      } } } },
    },
  })
  return c.json(rows.map((r) => ({ ...r, costPerGroup: costPerGroup(r.items), totalCost: costPerGroup(r.items) * (r.groups ?? 1) })))
})

// People who can be course leaders / teachers — FACULTY users only (not students or admin/lab team).
experiments.get('/people', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const list = await prisma.user.findMany({ where: { tenantId: u.tenant, role: 'FACULTY' }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } })
  return c.json(list)
})

experiments.get('/:id', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const r = await prisma.experiment.findUnique({
    where: { id: c.req.param('id') },
    include: { lab: true, items: { include: { item: true } } },
  })
  if (!r || r.tenantId !== c.get('user').tenant) return c.json({ error: 'Not found' }, 404)
  return c.json({ ...r, costPerGroup: costPerGroup(r.items as never), totalCost: costPerGroup(r.items as never) * (r.groups ?? 1) })
})

experiments.post('/', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.title) return c.json({ error: 'title is required' }, 400)
  const limit = planLimit(u.plan, 'experiments', u.status)
  if (limit != null) {
    const count = await prisma.experiment.count({ where: { tenantId: u.tenant } })
    if (count >= limit) return c.json({ error: `Plan limit reached (${limit} experiments). Upgrade to add more.`, limit }, 403)
  }
  const lines: Line[] = Array.isArray(b.items) ? b.items.filter((l: Line) => l.itemId) : []
  const exp = await prisma.experiment.create({
    data: {
      tenantId: u.tenant,
      subjectId: b.subjectId || null,
      labId: b.labId || null,
      title: b.title,
      courseCode: b.courseCode || null,
      facultyName: b.facultyName || null,
      groups: b.groups != null && b.groups !== '' ? Number(b.groups) : null,
      notes: b.notes || null,
      experimentManualUrl: b.experimentManualUrl || null,
      equipmentManualUrl: b.equipmentManualUrl || null,
      riskAssessmentUrl: b.riskAssessmentUrl || null,
      safetyOperatingProcedureUrl: b.safetyOperatingProcedureUrl || null,
      standardOperatingProcedureUrl: b.standardOperatingProcedureUrl || null,
      documents: Array.isArray(b.documents) ? JSON.stringify(b.documents) : (b.documents ?? null),
      items: { create: (await ownedItemLines(prisma, lines, u.tenant)).map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) || 1, unit: l.unit || "PIECE", consumed: !!l.consumed })) },
    },
    include: { items: true },
  })
  return c.json(exp, 201)
})

experiments.put('/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const existing = await prisma.experiment.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  const lines: Line[] = Array.isArray(b.items) ? b.items.filter((l: Line) => l.itemId) : []
  await prisma.experimentItem.deleteMany({ where: { experimentId: id } })
  const exp = await prisma.experiment.update({
    where: { id },
    data: {
      subjectId: b.subjectId || null,
      labId: b.labId || null,
      title: b.title,
      courseCode: b.courseCode || null,
      facultyName: b.facultyName || null,
      groups: b.groups != null && b.groups !== '' ? Number(b.groups) : null,
      notes: b.notes || null,
      experimentManualUrl: b.experimentManualUrl || null,
      equipmentManualUrl: b.equipmentManualUrl || null,
      riskAssessmentUrl: b.riskAssessmentUrl || null,
      safetyOperatingProcedureUrl: b.safetyOperatingProcedureUrl || null,
      standardOperatingProcedureUrl: b.standardOperatingProcedureUrl || null,
      documents: Array.isArray(b.documents) ? JSON.stringify(b.documents) : (b.documents ?? null),
      items: { create: (await ownedItemLines(prisma, lines, u.tenant)).map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) || 1, unit: l.unit || "PIECE", consumed: !!l.consumed })) },
    },
    include: { items: true },
  })
  return c.json(exp)
})

// Sync used (consumed) quantities of this experiment to inventory — applies only the DIFFERENCE
// vs what was already deducted, so editing a quantity later (10→9 / 10→11) corrects stock; safe to re-run.
experiments.post('/:id/deduct', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const exp = await prisma.experiment.findUnique({ where: { id: c.req.param('id') }, include: { items: true } })
  if (!exp || exp.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  let snap: Record<string, number> = {}
  try { snap = JSON.parse(exp.deductedSnapshot ?? '{}') } catch { snap = {} }
  const consumed = new Map<string, number>()
  for (const it of exp.items) if (it.consumed) consumed.set(it.itemId, (consumed.get(it.itemId) ?? 0) + Math.max(0, Math.round(it.quantity || 0)))
  const now = new Date()
  let netDeducted = 0
  // Apply only the DIFFERENCE vs last time, for every item ever consumed by this experiment.
  const ids = new Set<string>([...consumed.keys(), ...Object.keys(snap)])
  for (const itemId of ids) {
    const want = consumed.get(itemId) ?? 0
    const had = snap[itemId] ?? 0
    const deltaConsumed = want - had // >0 take more from stock (+OPEX), <0 give back (−OPEX)
    if (deltaConsumed !== 0) {
      const { used } = await adjustConsumption(prisma, {
        tenantId: u.tenant, itemId, deltaConsumed,
        reason: deltaConsumed > 0 ? 'experiment' : 'experiment-refund', refType: 'experiment', refId: exp.id,
        description: `Experiment: ${exp.title}`, date: now, userId: u.sub, userName: u.name,
      })
      netDeducted += used
    }
    if (want > 0) snap[itemId] = want; else delete snap[itemId]
  }
  const hasAny = Object.keys(snap).length > 0
  await prisma.experiment.update({ where: { id: exp.id }, data: { deductedSnapshot: JSON.stringify(snap), stockDeducted: hasAny } })
  return c.json({ ok: true, netDeducted })
})

// Link / unlink an experiment to a subject (lightweight — doesn't touch items/sessions).
experiments.patch('/:id/subject', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.experiment.findUnique({ where: { id: c.req.param('id') } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  return c.json(await prisma.experiment.update({ where: { id: existing.id }, data: { subjectId: b.subjectId || null } }))
})

experiments.delete('/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const existing = await prisma.experiment.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.experiment.delete({ where: { id } })
  return c.json({ ok: true })
})

export default experiments
