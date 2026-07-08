// Documentation library. Read: all logged-in. Write: lab team. tags stored as JSON string (SQLite).
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'

const docs = new Hono<{ Bindings: Env; Variables: AuthVars }>()

function parseTags(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

docs.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const q = c.req.query('q')?.toLowerCase()
  const list = await prisma.document.findMany({ where: { tenantId: u.tenant }, orderBy: { createdAt: 'desc' } })
  const mapped = list.map((d) => ({ ...d, tags: parseTags(d.tags) }))
  const filtered = q
    ? mapped.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)),
      )
    : mapped
  return c.json(filtered)
})

docs.post('/', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.title || !b.category || !b.fileUrl) {
    return c.json({ error: 'title, category and fileUrl are required' }, 400)
  }
  const tags: string[] = Array.isArray(b.tags) ? b.tags : []
  const doc = await prisma.document.create({
    data: {
      tenantId: u.tenant,
      title: b.title,
      category: b.category,
      fileUrl: b.fileUrl,
      tags: JSON.stringify(tags),
      version: b.version ?? '1.0',
      isPublic: b.isPublic ?? true,
      uploadedBy: u.name,
    },
  })
  return c.json({ ...doc, tags }, 201)
})

docs.delete('/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.document.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    await prisma.document.delete({ where: { id: c.req.param('id') } })
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

export default docs
