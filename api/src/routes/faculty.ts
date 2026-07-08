// Faculty register — feeds course-leader / faculty pickers. Read: any staff. Write: lab team.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'

const faculty = new Hono<{ Bindings: Env; Variables: AuthVars }>()

faculty.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  return c.json(await prisma.faculty.findMany({ where: { tenantId: u.tenant }, orderBy: { name: 'asc' } }))
})

faculty.post('/', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.name) return c.json({ error: 'name is required' }, 400)
  return c.json(await prisma.faculty.create({ data: { tenantId: u.tenant, name: b.name, email: b.email || null, department: b.department || null } }), 201)
})

faculty.put('/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.faculty.findUnique({ where: { id: c.req.param('id') } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  return c.json(await prisma.faculty.update({ where: { id: c.req.param('id') }, data: { name: b.name, email: b.email || null, department: b.department || null } }))
})

faculty.delete('/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.faculty.findUnique({ where: { id: c.req.param('id') } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.faculty.delete({ where: { id: c.req.param('id') } })
  return c.json({ ok: true })
})

export default faculty
