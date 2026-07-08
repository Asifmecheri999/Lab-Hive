// Vendors — supplier register. Read: lab team+. Write: lab team.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'

const ALL_LAB = [...LAB_TEAM, 'HEAD_OF_SCHOOL', 'DEAN', 'ADMIN']
const vendors = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// Only these columns may be written from the client; documents accepts an array or JSON string.
function vendorData(b: Record<string, unknown>) {
  const d: Record<string, unknown> = {}
  for (const k of ['name', 'contactName', 'email', 'phone', 'category', 'country', 'notes']) if (b[k] !== undefined) d[k] = b[k]
  if (b.isApproved !== undefined) d.isApproved = !!b.isApproved
  if (b.documents !== undefined) d.documents = Array.isArray(b.documents) ? JSON.stringify(b.documents) : (b.documents ?? null)
  return d
}

vendors.get('/', requireRole(...ALL_LAB), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const approved = c.req.query('approved')
  const list = await prisma.vendor.findMany({
    where: { tenantId: u.tenant, ...(approved === 'true' ? { isApproved: true } : {}) },
    orderBy: { name: 'asc' },
  })
  return c.json(list)
})

vendors.post('/', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.name) return c.json({ error: 'name is required' }, 400)
  const v = await prisma.vendor.create({ data: { tenantId: u.tenant, ...vendorData(b) } })
  return c.json(v, 201)
})

vendors.put('/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.vendor.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    const v = await prisma.vendor.update({ where: { id: c.req.param('id') }, data: vendorData(await c.req.json()) })
    return c.json(v)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

vendors.delete('/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.vendor.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    await prisma.vendor.delete({ where: { id: c.req.param('id') } })
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

export default vendors
