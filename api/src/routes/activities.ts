// Activities — projects / research / coursework / clubs. Items (inventory or custom) + consumable cost.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'

const WRITE = [...LAB_TEAM] // only lab team/admin create & edit; students/faculty are read-only (see their own)
const activities = new Hono<{ Bindings: Env; Variables: AuthVars }>()

type Line = { itemId?: string; customName?: string; quantity?: number; unit?: string; consumed?: boolean; price?: number }
const mapItems = (b: { items?: Line[] }) =>
  (Array.isArray(b.items) ? b.items : [])
    .filter((l) => l.itemId || l.customName)
    .map((l) => ({ itemId: l.itemId || null, customName: l.customName || null, quantity: Number(l.quantity) || 1, unit: l.unit || 'PIECE', consumed: !!l.consumed, price: l.price != null && l.price !== ('' as unknown) ? Number(l.price) : null }))

// consumable cost: qty * rate (inventory price by unit, or custom price)
function cost(items: { quantity: number; consumed: boolean; unit: string | null; price: number | null; item?: { pricePerPiece: number | null; pricePerBox: number | null } | null }[]) {
  return items.filter((i) => i.consumed).reduce((t, i) => {
    const rate = i.item ? (i.unit === 'BOX' ? (i.item.pricePerBox ?? 0) : (i.item.pricePerPiece ?? 0)) : (i.price ?? 0)
    return t + i.quantity * rate
  }, 0)
}

const INC = { lab: { select: { name: true } }, items: { include: { item: { select: { name: true, type: true, pricePerPiece: true, pricePerBox: true } } } } }

// Activity-specific fields shared by create + update.
function fields(b: Record<string, unknown>) {
  return {
    kind: (b.kind as string) || 'PROJECT', title: b.title as string,
    supervisor: (b.supervisor as string) || null, supervisorEmail: (b.supervisorEmail as string)?.toLowerCase() || null,
    researcher: (b.researcher as string) || null,
    userName: (b.userName as string) || null, userType: (b.userType as string) || null, userEmail: (b.userEmail as string)?.toLowerCase() || null,
    school: (b.school as string) || null, department: (b.department as string) || null,
    courseCode: (b.courseCode as string) || null, labId: (b.labId as string) || null,
    facilities: (b.facilities as string) || null, groupInfo: (b.groupInfo as string) || null, notes: (b.notes as string) || null,
    startDate: b.startDate ? new Date(b.startDate as string) : null,
    endDate: b.endDate ? new Date(b.endDate as string) : null,
    status: b.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
  }
}

activities.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  // Students/faculty only see activities that are theirs or that they supervise; lab team see all.
  const mine = !LAB_TEAM.includes(u.role)
  const where = mine
    ? { tenantId: u.tenant, OR: [{ userEmail: u.email }, { supervisorEmail: u.email }] }
    : { tenantId: u.tenant }
  const rows = await prisma.activity.findMany({ where, orderBy: { createdAt: 'desc' }, include: INC })
  return c.json(rows.map((r) => ({ ...r, consumableCost: cost(r.items), relation: mine ? (r.userEmail === u.email ? 'owner' : 'supervisor') : 'all' })))
})

activities.post('/', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.title) return c.json({ error: 'title is required' }, 400)
  const r = await prisma.activity.create({
    data: { tenantId: u.tenant, ...fields(b), items: { create: mapItems(b) } },
    include: INC,
  })
  return c.json({ ...r, consumableCost: cost(r.items) }, 201)
})

activities.put('/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const existing = await prisma.activity.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  await prisma.activityItem.deleteMany({ where: { activityId: id } })
  const r = await prisma.activity.update({
    where: { id },
    data: { ...fields(b), items: { create: mapItems(b) } },
    include: INC,
  })
  return c.json({ ...r, consumableCost: cost(r.items) })
})

// Append items to an activity (used by "add issuance items to the activity?").
activities.post('/:id/items', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const existing = await prisma.activity.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  await prisma.activityItem.createMany({ data: mapItems(b).map((m) => ({ ...m, activityId: id })) })
  return c.json({ ok: true })
})

activities.delete('/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const existing = await prisma.activity.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.activity.delete({ where: { id } })
  return c.json({ ok: true })
})

export default activities
