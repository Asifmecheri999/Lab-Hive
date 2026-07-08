// Finance — CAPEX assets, OPEX expenses, annual budget lines. Read: lab team+. Write: lab team.
// Depreciation / book value / variance are computed in the client; the API only stores raw records.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'

const ALL_LAB = [...LAB_TEAM, 'HEAD_OF_SCHOOL', 'DEAN', 'ADMIN']
const finance = new Hono<{ Bindings: Env; Variables: AuthVars }>()

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

// ── CAPEX assets (own records + inventory items flagged financeMode=CAPEX) ──
finance.get('/capex', requireRole(...ALL_LAB), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const records = await prisma.capexAsset.findMany({ where: { tenantId: u.tenant }, orderBy: { purchaseDate: 'desc' } })
  const inv = await prisma.inventoryItem.findMany({ where: { tenantId: u.tenant, financeMode: 'CAPEX' } })
  const derived = inv.map((it) => ({
    id: `inv:${it.id}`, source: 'inventory', name: it.name, category: it.category || it.stream || it.type || null,
    cost: (it.pricePerPiece ?? 0) * (it.quantity ?? 1),
    purchaseDate: it.purchaseDate ?? it.createdAt, usefulLifeYears: it.lifeYears ?? 5,
    disposed: false, disposedDate: null, notes: null, createdAt: it.createdAt,
  }))
  return c.json([...records.map((r) => ({ ...r, source: null })), ...derived])
})
finance.post('/capex', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json().catch(() => ({}))
  if (!b.name || b.cost == null || !b.purchaseDate || !b.usefulLifeYears) return c.json({ error: 'name, cost, purchaseDate and usefulLifeYears are required' }, 400)
  const v = await prisma.capexAsset.create({ data: {
    tenantId: u.tenant, name: String(b.name), category: b.category ?? null,
    cost: Number(b.cost), purchaseDate: new Date(b.purchaseDate), usefulLifeYears: Number(b.usefulLifeYears),
    disposed: !!b.disposed, disposedDate: b.disposedDate ? new Date(b.disposedDate) : null, notes: b.notes ?? null,
  } })
  return c.json(v, 201)
})
finance.put('/capex/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const row = await prisma.capexAsset.findUnique({ where: { id }, select: { tenantId: true } })
  if (!row || row.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (b.name !== undefined) data.name = b.name
  if (b.category !== undefined) data.category = b.category || null
  if (b.cost !== undefined) data.cost = Number(b.cost)
  if (b.purchaseDate !== undefined) data.purchaseDate = new Date(b.purchaseDate)
  if (b.usefulLifeYears !== undefined) data.usefulLifeYears = Number(b.usefulLifeYears)
  if (b.disposed !== undefined) data.disposed = !!b.disposed
  if (b.disposedDate !== undefined) data.disposedDate = b.disposedDate ? new Date(b.disposedDate) : null
  if (b.notes !== undefined) data.notes = b.notes || null
  try { return c.json(await prisma.capexAsset.update({ where: { id }, data })) }
  catch { return c.json({ error: 'Not found' }, 404) }
})
finance.delete('/capex/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const row = await prisma.capexAsset.findUnique({ where: { id }, select: { tenantId: true } })
  if (!row || row.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try { await prisma.capexAsset.delete({ where: { id } }); return c.json({ ok: true }) }
  catch { return c.json({ error: 'Not found' }, 404) }
})

// ── OPEX expenses (own records + inventory financeMode=OPEX + completed maintenance costs) ──
finance.get('/opex', requireRole(...ALL_LAB), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const records = await prisma.opexExpense.findMany({ where: { tenantId: u.tenant }, orderBy: { date: 'desc' } })
  const logs = await prisma.maintenanceLog.findMany({ where: { tenantId: u.tenant, includeInOpex: true, cost: { not: null } }, include: { item: { select: { name: true } } } })
  const mntDerived = logs
    .filter((m) => !['NOT_STARTED', 'IN_PROGRESS'].includes(String(m.status ?? '')))
    .map((m) => ({
      id: `mnt:${m.id}`, source: 'maintenance', amount: m.cost ?? 0, category: 'maintenance',
      description: m.description || (m.item?.name ? `Maintenance — ${m.item.name}` : 'Maintenance'),
      date: m.dueDate ?? m.createdAt, createdById: null, createdByName: 'Maintenance', createdAt: m.createdAt,
    }))
  return c.json([...records.map((r) => ({ ...r, source: r.source ?? null })), ...mntDerived])
})
finance.post('/opex', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json().catch(() => ({}))
  if (b.amount == null || !b.category || !b.date) return c.json({ error: 'amount, category and date are required' }, 400)
  const v = await prisma.opexExpense.create({ data: {
    tenantId: u.tenant, amount: Number(b.amount), category: String(b.category), description: b.description ?? null,
    date: new Date(b.date), attachmentUrl: b.attachmentUrl || null,
    attachments: Array.isArray(b.attachments) ? JSON.stringify(b.attachments) : (b.attachments ?? null),
    source: b.source ?? null, createdById: u.sub, createdByName: u.name ?? u.email ?? null,
  } })
  return c.json(v, 201)
})
finance.put('/opex/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const row = await prisma.opexExpense.findUnique({ where: { id }, select: { tenantId: true } })
  if (!row || row.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (b.amount !== undefined) data.amount = Number(b.amount)
  if (b.category !== undefined) data.category = b.category
  if (b.description !== undefined) data.description = b.description || null
  if (b.date !== undefined) data.date = new Date(b.date)
  if (b.attachmentUrl !== undefined) data.attachmentUrl = b.attachmentUrl || null
  if (b.attachments !== undefined) data.attachments = Array.isArray(b.attachments) ? JSON.stringify(b.attachments) : (b.attachments ?? null)
  try { return c.json(await prisma.opexExpense.update({ where: { id }, data })) }
  catch { return c.json({ error: 'Not found' }, 404) }
})
finance.delete('/opex/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const row = await prisma.opexExpense.findUnique({ where: { id }, select: { tenantId: true } })
  if (!row || row.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try { await prisma.opexExpense.delete({ where: { id } }); return c.json({ ok: true }) }
  catch { return c.json({ error: 'Not found' }, 404) }
})

// ── Budget lines ──
finance.get('/budget', requireRole(...ALL_LAB), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const year = num(c.req.query('year'))
  return c.json(await prisma.budgetLine.findMany({ where: { tenantId: u.tenant, ...(year ? { year } : {}) }, orderBy: { createdAt: 'asc' } }))
})
finance.post('/budget', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json().catch(() => ({}))
  if (!b.year || !b.category || b.allocated == null) return c.json({ error: 'year, category and allocated are required' }, 400)
  const v = await prisma.budgetLine.create({ data: {
    tenantId: u.tenant, year: Number(b.year), category: String(b.category), description: b.description ?? null,
    type: b.type === 'CAPEX' ? 'CAPEX' : 'OPEX', allocated: Number(b.allocated),
    attachments: Array.isArray(b.attachments) ? JSON.stringify(b.attachments) : (b.attachments ?? null),
  } })
  return c.json(v, 201)
})
finance.put('/budget/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const row = await prisma.budgetLine.findUnique({ where: { id }, select: { tenantId: true } })
  if (!row || row.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (b.year !== undefined) data.year = Number(b.year)
  if (b.category !== undefined) data.category = b.category
  if (b.description !== undefined) data.description = b.description || null
  if (b.type !== undefined) data.type = b.type === 'CAPEX' ? 'CAPEX' : 'OPEX'
  if (b.allocated !== undefined) data.allocated = Number(b.allocated)
  if (b.attachments !== undefined) data.attachments = Array.isArray(b.attachments) ? JSON.stringify(b.attachments) : (b.attachments ?? null)
  try { return c.json(await prisma.budgetLine.update({ where: { id }, data })) }
  catch { return c.json({ error: 'Not found' }, 404) }
})
finance.delete('/budget/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const row = await prisma.budgetLine.findUnique({ where: { id }, select: { tenantId: true } })
  if (!row || row.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try { await prisma.budgetLine.delete({ where: { id } }); return c.json({ ok: true }) }
  catch { return c.json({ error: 'Not found' }, 404) }
})

export default finance
