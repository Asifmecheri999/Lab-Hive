// Subjects / courses — group experiments. Read: any staff. Write: lab team + faculty.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'

const WRITE = [...LAB_TEAM, 'FACULTY']
const subjects = new Hono<{ Bindings: Env; Variables: AuthVars }>()

subjects.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const rows = await prisma.subject.findMany({
    where: { tenantId: u.tenant },
    orderBy: { name: 'asc' },
    include: { _count: { select: { experiments: true } } },
  })
  return c.json(rows)
})

subjects.post('/', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.name) return c.json({ error: 'name is required' }, 400)
  return c.json(await prisma.subject.create({ data: { tenantId: u.tenant, name: b.name, code: b.code || null, facultyName: b.facultyName || null, color: b.color || null } }), 201)
})

subjects.put('/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.subject.findUnique({ where: { id: c.req.param('id') } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  return c.json(await prisma.subject.update({ where: { id: c.req.param('id') }, data: { name: b.name, code: b.code || null, facultyName: b.facultyName || null, color: b.color || null } }))
})

subjects.delete('/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.subject.findUnique({ where: { id: c.req.param('id') } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.subject.delete({ where: { id: c.req.param('id') } })
  return c.json({ ok: true })
})

export default subjects
