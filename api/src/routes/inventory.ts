// Inventory / asset register — full equipment details, compliance, docs.
// Reads: any logged-in user. Writes: lab team (+ admin).
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, planLimit, type AuthVars } from '../middleware/auth'
import { adjustConsumption } from '../lib/stock'

const INVENTORY_TYPES = ['EQUIPMENT', 'CONSUMABLE', 'PPE', 'TOOL']
const inventory = new Hono<{ Bindings: Env; Variables: AuthVars }>()

const STR = [
  'name', 'type', 'category', 'unit', 'labId', 'location', 'subLocation', 'ownership', 'stream',
  'serialNumber', 'barcode', 'pictureUrl', 'barcodeUrl', 'electricalReq', 'additionalMep',
  'maintenanceType', 'maintenanceFrequency', 'maintenanceCertificateUrl',
  'calibrationType', 'calibrationFrequency', 'calibrationCertificateUrl', 'serviceProviderId',
  'supplierId', 'priceCurrency',
  'coshhUrl', 'riskAssessmentUrl', 'experimentManualUrl', 'safetyOperatingProcedureUrl',
  'standardOperatingProcedureUrl', 'maintenanceLogUrl', 'equipmentManualUrl', 'extraDocuments', 'comments', 'notes', 'financeMode',
]
const INT = ['quantity', 'minQuantity', 'lifeYears']
const FLOAT = ['pricePerPiece', 'pricePerDozen', 'pricePerBox', 'unitsPerBox']
const BOOL = ['patRequired', 'maintenanceRequired', 'calibrationRequired']
const DATE = ['patExpiration', 'lastMaintenanceDate', 'nextMaintenanceDue', 'calibrationDate', 'calibrationExpiry', 'purchaseDate']

function buildData(b: Record<string, unknown>, partial: boolean) {
  const d: Record<string, unknown> = {}
  for (const k of STR) if (!partial || k in b) d[k] = b[k] === '' ? null : (b[k] ?? null)
  for (const k of INT) if (!partial || k in b) d[k] = b[k] == null || b[k] === '' ? 0 : Number(b[k])
  for (const k of FLOAT) if (!partial || k in b) d[k] = b[k] == null || b[k] === '' ? null : Number(b[k])
  for (const k of BOOL) if (!partial || k in b) d[k] = !!b[k]
  for (const k of DATE) if (!partial || k in b) d[k] = b[k] ? new Date(String(b[k])) : null
  return d
}

inventory.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const type = c.req.query('type')
  const lowStock = c.req.query('lowStock') === 'true'
  // Safety cap so a pathological tenant can't load tens of thousands of rows into the
  // grid and stall the worker. 5000 = the largest plan's inventory limit, so tenants
  // within their plan always get everything; only unbounded (enterprise) mega-catalogues
  // are capped — those want server-side paging, a follow-up if it ever bites.
  const items = await prisma.inventoryItem.findMany({
    where: { tenantId: u.tenant, ...(type ? { type } : {}) },
    orderBy: { name: 'asc' },
    include: { lab: true, serviceProvider: true, supplier: true },
    take: 5000,
  })
  return c.json(lowStock ? items.filter((i) => i.quantity <= i.minQuantity) : items)
})

inventory.get('/:id', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const item = await prisma.inventoryItem.findUnique({
    where: { id: c.req.param('id') },
    include: { lab: true, serviceProvider: true, supplier: true, maintenanceLogs: true },
  })
  if (!item || item.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  return c.json(item)
})

inventory.post('/', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.name || !b.type) return c.json({ error: 'name and type are required' }, 400)
  if (!INVENTORY_TYPES.includes(b.type)) return c.json({ error: `type must be one of ${INVENTORY_TYPES.join(', ')}` }, 400)
  if (!b.category) b.category = 'Uncategorised' // category is optional in the UI; DB column is required
  // Plan limit (capped plans limit inventory; an active trial is unlimited)
  const limit = planLimit(u.plan, 'inventory', u.status)
  if (limit != null) {
    const count = await prisma.inventoryItem.count({ where: { tenantId: u.tenant } })
    if (count >= limit) return c.json({ error: `Plan limit reached (${limit} items). Upgrade to add more.`, limit }, 403)
  }
  const item = await prisma.inventoryItem.create({ data: { ...buildData(b, false), tenantId: u.tenant } as never })
  return c.json(item, 201)
})

inventory.put('/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const b = await c.req.json()
  if (b.type && !INVENTORY_TYPES.includes(b.type)) return c.json({ error: `type must be one of ${INVENTORY_TYPES.join(', ')}` }, 400)
  if ('category' in b && !b.category) b.category = 'Uncategorised' // keep required DB column populated
  try {
    const before = await prisma.inventoryItem.findUnique({ where: { id }, select: { quantity: true, tenantId: true } })
    if (!before || before.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
    const item = await prisma.inventoryItem.update({ where: { id }, data: buildData(b, true) as never })
    // Ledger a manual stock correction so the audit trail stays complete.
    if (before && b.quantity !== undefined && b.quantity !== '' && Number(b.quantity) !== before.quantity) {
      await prisma.stockMovement.create({ data: { tenantId: u.tenant, itemId: id, delta: Number(b.quantity) - before.quantity, reason: 'adjustment', refType: 'manual', createdById: u.sub } })
    }
    return c.json(item)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// Delete ALL inventory for the current tenant (admin only) — for a fresh start.
inventory.delete('/', requireRole('ADMIN'), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const ids = (await prisma.inventoryItem.findMany({ where: { tenantId: u.tenant }, select: { id: true } })).map((i) => i.id)
  if (!ids.length) return c.json({ deleted: 0 })
  await prisma.stockMovement.deleteMany({ where: { itemId: { in: ids } } })
  await prisma.maintenanceLog.deleteMany({ where: { itemId: { in: ids } } })
  await prisma.maintenanceSchedule.deleteMany({ where: { itemId: { in: ids } } })
  await prisma.experimentItem.deleteMany({ where: { itemId: { in: ids } } })
  await prisma.activityItem.updateMany({ where: { itemId: { in: ids } }, data: { itemId: null } })
  await prisma.issuanceItem.updateMany({ where: { itemId: { in: ids } }, data: { itemId: null } })
  await prisma.procurementItem.updateMany({ where: { itemId: { in: ids } }, data: { itemId: null } })
  const r = await prisma.inventoryItem.deleteMany({ where: { tenantId: u.tenant } })
  return c.json({ deleted: r.count })
})

inventory.delete('/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  try {
    const it = await prisma.inventoryItem.findUnique({ where: { id }, select: { tenantId: true } })
    if (!it || it.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
    // Remove hard dependents (these require an item)…
    await prisma.stockMovement.deleteMany({ where: { itemId: id } })
    await prisma.maintenanceLog.deleteMany({ where: { itemId: id } })
    await prisma.maintenanceSchedule.deleteMany({ where: { itemId: id } })
    await prisma.experimentItem.deleteMany({ where: { itemId: id } })
    // …and unlink soft references (keep the records, drop the item link)
    await prisma.activityItem.updateMany({ where: { itemId: id }, data: { itemId: null } })
    await prisma.issuanceItem.updateMany({ where: { itemId: id }, data: { itemId: null } })
    await prisma.procurementItem.updateMany({ where: { itemId: id }, data: { itemId: null } })
    await prisma.inventoryItem.delete({ where: { id } })
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: `Delete failed: ${(e as Error).message}` }, 400)
  }
})

// Record consumption (used / broken / borrowed-not-returned): drop stock + post an OPEX expense
// valued at the item's average unit cost, dated to the day it was used.
inventory.post('/:id/consume', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json().catch(() => ({}))
  const qty = Math.max(0, Math.round(Number(b.quantity) || 0))
  if (qty <= 0) return c.json({ error: 'quantity must be greater than 0' }, 400)
  const it = await prisma.inventoryItem.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true, name: true } })
  if (!it || it.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const when = b.date ? new Date(b.date) : new Date()
  const reason = b.reason ? ` — ${String(b.reason)}` : ''
  const { used, amount } = await adjustConsumption(prisma, {
    tenantId: u.tenant, itemId: c.req.param('id'), deltaConsumed: qty, reason: 'consumed', refType: 'manual',
    description: `Used ${qty} × ${it.name}${reason}`, date: when, userId: u.sub, userName: u.name ?? u.email ?? null,
  })
  return c.json({ ok: true, used, amount })
})

// Stock ledger for one item — every movement (in/out/adjust) with reason + cost.
inventory.get('/:id/movements', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const it = await prisma.inventoryItem.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!it || it.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  return c.json(await prisma.stockMovement.findMany({ where: { itemId: c.req.param('id') }, orderBy: { date: 'desc' }, take: 200 }))
})

export default inventory
