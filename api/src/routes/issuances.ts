// Issuances — equipment / item borrowal forms. Items from inventory or custom ("Other").
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'
import { moveStock, adjustConsumption } from '../lib/stock'

const WRITE = [...LAB_TEAM] // only lab team/admin issue items; students/faculty are read-only (see their own)
const issuances = new Hono<{ Bindings: Env; Variables: AuthVars }>()

type Line = { itemId?: string; customName?: string; quantity?: number; unit?: string; consumed?: boolean; price?: number }
// Keep only line items whose inventory item belongs to the caller's tenant — drop any body-supplied
// itemId pointing at another tenant's InventoryItem (it would otherwise leak that item's name/type
// back through the item include on read). Custom ("Other") lines have no itemId. #tenant-isolation
async function mapOwnedItems(prisma: ReturnType<typeof getPrisma>, b: { items?: Line[] }, tenant?: string) {
  const raw = (Array.isArray(b.items) ? b.items : []).filter((l) => l.itemId || l.customName)
  const ids = [...new Set(raw.map((l) => l.itemId).filter(Boolean) as string[])]
  const owned = ids.length && tenant
    ? new Set((await prisma.inventoryItem.findMany({ where: { id: { in: ids }, tenantId: tenant }, select: { id: true } })).map((i) => i.id))
    : new Set<string>()
  return raw
    .filter((l) => !l.itemId || owned.has(l.itemId))
    .map((l) => ({ itemId: l.itemId || null, customName: l.customName || null, quantity: Number(l.quantity) || 1, unit: l.unit || 'PIECE', consumed: !!l.consumed, price: l.price != null && l.price !== ('' as unknown) ? Number(l.price) : null }))
}

// Validate a body-supplied activityId belongs to the caller's tenant; returns the id or null so an
// issuance can never link to (and thereby read/write) another tenant's Activity. #tenant-isolation
async function ownedActivityId(prisma: ReturnType<typeof getPrisma>, activityId: string | null, tenant?: string) {
  if (!activityId || !tenant) return null
  const a = await prisma.activity.findFirst({ where: { id: activityId, tenantId: tenant }, select: { id: true } })
  return a ? activityId : null
}

function fields(b: Record<string, unknown>) {
  return {
    activityId: (b.activityId as string) || null,
    studentName: (b.studentName as string) || null,
    groupName: (b.groupName as string) || null,
    facultyName: (b.facultyName as string) || null,
    courseCode: (b.courseCode as string) || null,
    studentEmail: (b.studentEmail as string)?.toLowerCase() || null,
    facultyEmail: (b.facultyEmail as string)?.toLowerCase() || null,
    supervisorName: (b.supervisorName as string) || null,
    supervisorEmail: (b.supervisorEmail as string)?.toLowerCase() || null,
    school: (b.school as string) || null,
    department: (b.department as string) || null,
    groupInfo: (b.groupInfo as string) || null,
    borrowDate: (b.borrowDate as string) || null,
    returnDate: (b.returnDate as string) || null,
    status: (b.status as string) || 'ISSUED',
    notes: (b.notes as string) || null,
  }
}

const INC = { activity: { select: { title: true, kind: true } }, items: { include: { item: { select: { name: true, type: true } } } } }

// Item sync is one-way: the issuance is the source of truth, so its items mirror into the linked
// activity (read-only there). We never push activity items back into the issuance — that would add
// undeducted items to an already-deducted issuance and corrupt stock/OPEX.
async function syncItemsToActivity(prisma: ReturnType<typeof getPrisma>, issuanceId: string, tenant?: string) {
  const iss = await prisma.issuance.findUnique({ where: { id: issuanceId }, include: { items: true, activity: { include: { items: true } } } })
  if (!iss?.activity) return
  // The linked activityId came from the request body; never read from or write into an Activity
  // that isn't the caller's, even if a stale cross-tenant link somehow slipped through. #tenant-isolation
  if (iss.activity.tenantId !== tenant) return
  const key = (i: { itemId: string | null; customName: string | null }) => String(i.itemId || i.customName)
  // issuance items missing from the activity → add to activity
  const actKnown = new Set(iss.activity.items.map(key))
  const toAct = iss.items.filter((i) => (i.itemId || i.customName) && !actKnown.has(key(i)))
  if (toAct.length) await prisma.activityItem.createMany({ data: toAct.map((m) => ({ activityId: iss.activity!.id, itemId: m.itemId, customName: m.customName, quantity: m.quantity, unit: m.unit, consumed: m.consumed, price: m.price })) })
  // group info: fill whichever side is empty from the other
  if (iss.groupInfo && !iss.activity.groupInfo) await prisma.activity.update({ where: { id: iss.activity.id }, data: { groupInfo: iss.groupInfo } })
  else if (!iss.groupInfo && iss.activity.groupInfo) await prisma.issuance.update({ where: { id: iss.id }, data: { groupInfo: iss.activity.groupInfo } })
}

issuances.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  // Students/faculty only see issuances where they're the borrower/faculty/supervisor; lab team see all.
  const mine = !LAB_TEAM.includes(u.role)
  const where = mine
    ? { tenantId: u.tenant, OR: [{ studentEmail: u.email }, { facultyEmail: u.email }, { supervisorEmail: u.email }] }
    : { tenantId: u.tenant }
  const rows = await prisma.issuance.findMany({ where, orderBy: { createdAt: 'desc' }, include: INC })
  return c.json(rows.map((r) => ({ ...r, relation: mine ? (r.studentEmail === u.email ? 'owner' : 'supervisor') : 'all' })))
})

issuances.post('/', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.studentName && !b.groupName) return c.json({ error: 'student name or group is required' }, 400)
  const activityId = await ownedActivityId(prisma, (b.activityId as string) || null, u.tenant)
  const created = await prisma.issuance.create({ data: { tenantId: u.tenant, ...fields(b), activityId, items: { create: await mapOwnedItems(prisma, b, u.tenant) } }, include: INC })
  await syncItemsToActivity(prisma, created.id, u.tenant)
  return c.json(created, 201)
})

issuances.put('/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const existing = await prisma.issuance.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  // Items are locked once stock has been deducted (until returned) — re-writing them would desync stock/OPEX.
  const lockItems = existing.stockDeducted && !existing.stockReturned
  if (!lockItems) await prisma.issuanceItem.deleteMany({ where: { issuanceId: id } })
  const activityId = await ownedActivityId(prisma, (b.activityId as string) || null, u.tenant)
  const updated = await prisma.issuance.update({ where: { id }, data: { ...fields(b), activityId, ...(lockItems ? {} : { items: { create: await mapOwnedItems(prisma, b, u.tenant) } }) }, include: INC })
  await syncItemsToActivity(prisma, id, u.tenant)
  return c.json(updated)
})

issuances.delete('/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const existing = await prisma.issuance.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.issuance.delete({ where: { id } })
  return c.json({ ok: true })
})

// Issue the items: borrowed (returnable) items leave stock; CONSUMED items leave stock AND post OPEX.
// One-time per issuance. Use /return to put borrowed items back.
issuances.post('/:id/deduct', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const iss = await prisma.issuance.findUnique({ where: { id }, include: { items: true } })
  if (!iss || iss.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  if (iss.stockDeducted) return c.json({ error: 'Already deducted from stock' }, 400)
  // Inventory items are deducted/consumed below. Non-inventory ("Other") items are skipped — they're
  // recorded only, never stock-tracked, and (since they can't be marked "used up") never hit OPEX.
  const who = iss.studentName ?? iss.groupName ?? 'issuance'
  const now = new Date()
  for (const it of iss.items) {
    if (!it.itemId) continue
    const qty = Math.round(it.quantity || 0)
    if (qty <= 0) continue
    if (it.consumed) {
      await adjustConsumption(prisma, { tenantId: u.tenant, itemId: it.itemId, deltaConsumed: qty, reason: 'consumed', refType: 'issuance', refId: iss.id, description: `Issued (consumed) — ${who}`, date: now, userId: u.sub, userName: u.name })
    } else {
      await moveStock(prisma, { tenantId: u.tenant, itemId: it.itemId, delta: -qty, reason: 'issued', refType: 'issuance', refId: iss.id, note: `Borrowed — ${who}`, date: now, userId: u.sub })
    }
  }
  // Record exactly what left stock so Return restores the right amounts even if items are edited later.
  const snapshot = iss.items.filter((it) => it.itemId && Math.round(it.quantity || 0) > 0).map((it) => ({ itemId: it.itemId, qty: Math.round(it.quantity || 0), consumed: !!it.consumed }))
  await prisma.issuance.update({ where: { id }, data: { stockDeducted: true, deductedSnapshot: JSON.stringify(snapshot) } })
  return c.json({ ok: true })
})

// Return: put borrowed (non-consumed) items back into stock and mark RETURNED. Consumed items stay gone.
issuances.post('/:id/return', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const iss = await prisma.issuance.findUnique({ where: { id }, include: { items: true } })
  if (!iss || iss.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  if (iss.stockReturned) return c.json({ error: 'Already returned' }, 400)
  const who = iss.studentName ?? iss.groupName ?? 'issuance'
  const now = new Date()
  let restored = 0
  if (iss.stockDeducted) {
    // Restore from the deduction snapshot (what actually left stock), not current items — avoids over/under-restock if items were edited.
    let snap: { itemId?: string | null; qty?: number; consumed?: boolean }[] = []
    try { snap = JSON.parse(iss.deductedSnapshot ?? '[]') } catch { snap = [] }
    const src = snap.length ? snap : iss.items.map((it) => ({ itemId: it.itemId, qty: Math.round(it.quantity || 0), consumed: it.consumed }))
    for (const s of src) {
      if (!s.itemId || s.consumed) continue
      const qty = Math.round(Number(s.qty) || 0)
      if (qty > 0) restored += await moveStock(prisma, { tenantId: u.tenant, itemId: s.itemId, delta: qty, reason: 'returned', refType: 'issuance', refId: iss.id, note: `Returned — ${who}`, date: now, userId: u.sub })
    }
  }
  await prisma.issuance.update({ where: { id }, data: { stockReturned: true, status: 'RETURNED' } })
  return c.json({ ok: true, restored })
})

// Borrower (or lab team) marks the items returned — flags RETURNED so both sides update.
// Stock is restored separately by the lab team via /return (students can't change stock).
issuances.post('/:id/mark-returned', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const iss = await prisma.issuance.findUnique({ where: { id } })
  if (!iss || iss.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const isBorrower = [iss.studentEmail, iss.facultyEmail, iss.supervisorEmail].filter(Boolean).includes(u.email)
  if (!LAB_TEAM.includes(u.role) && !isBorrower) return c.json({ error: 'Only the borrower or lab team can do this.' }, 403)
  await prisma.issuance.update({ where: { id }, data: { status: 'RETURNED' } })
  return c.json({ ok: true })
})

export default issuances
