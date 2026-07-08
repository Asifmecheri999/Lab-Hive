// Maintenance — logs + schedules. Lab team only.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'

const TYPES = ['PREVENTIVE', 'SERVICE', 'REPAIR', 'CALIBRATION', 'AMC', 'PAT', 'SCHEDULED', 'CORRECTIVE', 'INSPECTION']
const maintenance = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// itemId is a body-supplied FK to InventoryItem (a tenant-scoped model). Never accept one that
// isn't the caller's — otherwise a log/schedule attaches to (and can leak, via the item include
// on GET /logs or the AI maintenance snapshot) another tenant's equipment. #tenant-isolation
async function ownsItem(prisma: ReturnType<typeof getPrisma>, itemId: string | undefined, tenant?: string) {
  if (!itemId || !tenant) return false
  const it = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { tenantId: true } })
  return !!it && it.tenantId === tenant
}

maintenance.use('*', requireRole(...LAB_TEAM))

// Lab staff who can be assigned in-house maintenance (lab team only — no faculty/students).
maintenance.get('/staff', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const list = await prisma.user.findMany({
    where: { tenantId: u.tenant, role: { in: ['LAB_TECHNICIAN', 'LAB_COORDINATOR', 'LAB_MANAGER'] } },
    select: { id: true, name: true }, orderBy: { name: 'asc' },
  })
  return c.json(list)
})

// ── Logs ──
maintenance.get('/logs', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  return c.json(
    await prisma.maintenanceLog.findMany({ where: { tenantId: u.tenant }, orderBy: { createdAt: 'desc' }, include: { item: true } }),
  )
})

maintenance.post('/logs', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.itemId || !b.type || !b.description) {
    return c.json({ error: 'itemId, type and description are required' }, 400)
  }
  if (!TYPES.includes(b.type)) return c.json({ error: `type must be one of ${TYPES.join(', ')}` }, 400)
  if (!(await ownsItem(prisma, b.itemId, u.tenant))) return c.json({ error: 'item not found' }, 404)
  const log = await prisma.maintenanceLog.create({
    data: {
      tenantId: u.tenant,
      itemId: b.itemId,
      type: b.type,
      status: b.status || 'NOT_STARTED',
      mode: b.mode || null,
      description: b.description,
      performedBy: b.performedBy ?? u.name,
      technicianId: u.sub,
      cost: b.cost != null && b.cost !== '' ? Number(b.cost) : null,
      includeInOpex: b.includeInOpex === undefined ? true : !!b.includeInOpex,
      dueDate: b.dueDate ? new Date(b.dueDate) : null,
      nextDueDate: b.nextDueDate ? new Date(b.nextDueDate) : null,
      fileUrl: b.fileUrl || null,
      documents: b.documents ? JSON.stringify(b.documents) : null,
      notes: b.notes || null,
    },
  })
  return c.json(log, 201)
})

// Full update of a log
maintenance.put('/logs/:id', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const ex = await prisma.maintenanceLog.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  try {
    const log = await prisma.maintenanceLog.update({
      where: { id: c.req.param('id') },
      data: {
        ...(b.type ? { type: b.type } : {}),
        status: b.status || 'NOT_STARTED',
        mode: b.mode || null,
        description: b.description ?? '',
        performedBy: b.performedBy || null,
        cost: b.cost != null && b.cost !== '' ? Number(b.cost) : null,
        ...(b.includeInOpex !== undefined ? { includeInOpex: !!b.includeInOpex } : {}),
        dueDate: b.dueDate ? new Date(b.dueDate) : null,
        nextDueDate: b.nextDueDate ? new Date(b.nextDueDate) : null,
        fileUrl: b.fileUrl || null,
        documents: b.documents ? JSON.stringify(b.documents) : null,
        notes: b.notes || null,
      },
    })
    return c.json(log)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// Delete a maintenance log
maintenance.delete('/logs/:id', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const log = await prisma.maintenanceLog.findUnique({ where: { id: c.req.param('id') } })
  if (!log || log.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.maintenanceLog.delete({ where: { id: log.id } })
  return c.json({ ok: true })
})

// Full update of a schedule (preventive task)
maintenance.put('/schedules/:id', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const ex = await prisma.maintenanceSchedule.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  if (b.itemId && !(await ownsItem(prisma, b.itemId, u.tenant))) return c.json({ error: 'item not found' }, 404)
  try {
    const s = await prisma.maintenanceSchedule.update({
      where: { id: c.req.param('id') },
      data: {
        ...(b.itemId ? { itemId: b.itemId } : {}),
        title: b.title,
        frequencyDays: Number(b.frequencyDays) || 30,
        ...(b.nextDue ? { nextDue: new Date(b.nextDue) } : {}),
        assignedTo: b.assignedTo || null,
        notes: b.notes || null,
      },
    })
    return c.json(s)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// Update a log's status (Not started / In progress / Done)
maintenance.patch('/logs/:id/status', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const { status } = await c.req.json()
  if (!['NOT_STARTED', 'IN_PROGRESS', 'DONE'].includes(status)) return c.json({ error: 'bad status' }, 400)
  const { count } = await prisma.maintenanceLog.updateMany({ where: { id: c.req.param('id'), tenantId: u.tenant }, data: { status } })
  if (count === 0) return c.json({ error: 'Not found' }, 404)
  const log = await prisma.maintenanceLog.findUnique({ where: { id: c.req.param('id') } })
  return c.json(log)
})

// ── Schedules (with overdue flag) ──
maintenance.get('/schedules', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const list = await prisma.maintenanceSchedule.findMany({ where: { tenantId: u.tenant }, orderBy: { nextDue: 'asc' } })
  const now = Date.now()
  return c.json(list.map((s) => ({ ...s, overdue: new Date(s.nextDue).getTime() < now })))
})

maintenance.post('/schedules', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const b = await c.req.json()
  if (!b.itemId || !b.title || !b.frequencyDays || !b.nextDue) {
    return c.json({ error: 'itemId, title, frequencyDays and nextDue are required' }, 400)
  }
  const u = c.get('user')
  if (!(await ownsItem(prisma, b.itemId, u.tenant))) return c.json({ error: 'item not found' }, 404)
  const s = await prisma.maintenanceSchedule.create({
    data: {
      tenantId: u.tenant,
      itemId: b.itemId,
      title: b.title,
      frequencyDays: Number(b.frequencyDays),
      nextDue: new Date(b.nextDue),
      lastDone: b.lastDone ? new Date(b.lastDone) : null,
      assignedTo: b.assignedTo,
      notes: b.notes,
    },
  })
  return c.json(s, 201)
})

export default maintenance
