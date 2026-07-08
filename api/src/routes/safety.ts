// Safety hub — safety documents (read all, write lab team) + PPE requests (anyone create, lab team approve).
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'
import { notifyUser } from '../lib/webpush'

const safety = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// ── PPE options — the item list students pick from when requesting PPE ──
// Admin-managed on the tenant; falls back to inventory items of type PPE for older workspaces.
safety.get('/ppe-options', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const t = u.tenant ? await prisma.tenant.findUnique({ where: { id: u.tenant }, select: { ppeOptions: true } }) : null
  let options: string[] = []
  try { const p = JSON.parse(t?.ppeOptions ?? '[]'); if (Array.isArray(p)) options = p.map(String).filter(Boolean) } catch { /* ignore */ }
  if (!options.length) {
    const inv = await prisma.inventoryItem.findMany({ where: { tenantId: u.tenant, type: 'PPE' }, select: { name: true } })
    options = [...new Set(inv.map((i) => i.name).filter(Boolean))]
  }
  return c.json({ options })
})

safety.put('/ppe-options', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json().catch(() => ({}))
  const options = [...new Set(
    (Array.isArray(b.options) ? b.options : []).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 100),
  )]
  await prisma.tenant.update({ where: { id: u.tenant }, data: { ppeOptions: JSON.stringify(options) } })
  return c.json({ ok: true, options })
})

// ── Safety documents ──
safety.get('/documents', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  // Faculty only get blank templates + their own (or supervised) RA submissions —
  // never other people's documents or equipment/inventory documents.
  if (u.role === 'FACULTY') {
    const [templates, ra] = await Promise.all([
      prisma.safetyDocument.findMany({ where: { tenantId: u.tenant, type: 'TEMPLATE' }, orderBy: { createdAt: 'desc' } }),
      prisma.safetyDocument.findMany({ where: { tenantId: u.tenant, type: 'RA', OR: [{ submittedById: u.sub }, { supervisor: { contains: u.email } }] }, orderBy: { createdAt: 'desc' } }),
    ])
    return c.json([...ra, ...templates])
  }
  return c.json(await prisma.safetyDocument.findMany({ where: { tenantId: u.tenant }, orderBy: { createdAt: 'desc' } }))
})

safety.post('/documents', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const b = await c.req.json()
  if (!b.title || !b.type || !b.fileUrl) {
    return c.json({ error: 'title, type and fileUrl are required' }, 400)
  }
  const u = c.get('user')
  const doc = await prisma.safetyDocument.create({
    data: {
      tenantId: u.tenant,
      title: b.title,
      type: b.type,
      fileUrl: b.fileUrl,
      version: b.version ?? '1.0',
      equipment: b.equipment,
    },
  })
  return c.json(doc, 201)
})

safety.put('/documents/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.title || !b.type || !b.fileUrl) return c.json({ error: 'title, type and fileUrl are required' }, 400)
  const row = await prisma.safetyDocument.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!row || row.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    const doc = await prisma.safetyDocument.update({
      where: { id: c.req.param('id') },
      data: { title: b.title, type: b.type, fileUrl: b.fileUrl, version: b.version ?? '1.0', equipment: b.equipment ?? null },
    })
    return c.json(doc)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

safety.delete('/documents/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const row = await prisma.safetyDocument.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!row || row.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    await prisma.safetyDocument.delete({ where: { id: c.req.param('id') } })
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// ── RA (risk assessment) submissions ──
// Anyone can submit a filled RA for their project; lab team reviews. Stored as a SafetyDocument (type 'RA').
safety.get('/ra', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const mine = !LAB_TEAM.includes(u.role) // non-lab see their own + any they supervise
  // Supervisor is stored as "Name <email>" — match by the precise email so faculty see RAs they
  // supervise; only fall back to name when the user has no email, so short names can't leak others' RAs.
  const supMatch: Record<string, unknown>[] = [{ submittedById: u.sub }]
  if (u.email) supMatch.push({ supervisor: { contains: u.email } })
  else if (u.name) supMatch.push({ supervisor: { contains: u.name } })
  const hidden = await prisma.requestHide.findMany({ where: { userId: u.sub, refType: 'RA' }, select: { refId: true } })
  const hideIds = hidden.map((h) => h.refId)
  const where = mine
    ? { tenantId: u.tenant, type: 'RA', OR: supMatch, ...(hideIds.length ? { id: { notIn: hideIds } } : {}) }
    : { tenantId: u.tenant, type: 'RA', ...(hideIds.length ? { id: { notIn: hideIds } } : {}) }
  const rows = await prisma.safetyDocument.findMany({ where, orderBy: { createdAt: 'desc' } })
  return c.json(rows.map((r) => ({ ...r, relation: mine ? (r.submittedById === u.sub ? 'owner' : 'supervisor') : 'all' })))
})

safety.post('/ra', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.title || !b.fileUrl) return c.json({ error: 'title and a filled RA file are required' }, 400)
  const doc = await prisma.safetyDocument.create({
    data: {
      tenantId: u.tenant,
      title: b.title,
      type: 'RA',
      fileUrl: b.fileUrl,
      equipment: b.equipment ?? null,
      project: b.project ?? null,
      supervisor: b.supervisor ?? null,
      school: b.school ?? null,
      department: b.department ?? null,
      status: 'submitted',
      submittedById: u.sub,
      submittedByName: u.name ?? null,
    },
  })
  return c.json(doc, 201)
})

// "Delete" an RA submission = hide for me only. The other side keeps seeing it.
safety.delete('/ra/:id', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const doc = await prisma.safetyDocument.findUnique({ where: { id: c.req.param('id') } })
  if (!doc || doc.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.requestHide.upsert({
    where: { userId_refType_refId: { userId: u.sub, refType: 'RA', refId: doc.id } },
    update: {},
    create: { tenantId: u.tenant, userId: u.sub, refType: 'RA', refId: doc.id },
  })
  return c.json({ ok: true })
})

// Review an RA submission — lab team only. decision: approve | revise | hold | reject
safety.post('/ra/:id/:decision', requireRole(...LAB_TEAM), async (c) => {
  const decision = c.req.param('decision')
  const map: Record<string, string> = { approve: 'approved', revise: 'revise', hold: 'hold', reject: 'rejected' }
  if (!map[decision]) return c.json({ error: 'bad decision' }, 400)
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const row = await prisma.safetyDocument.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!row || row.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    const doc = await prisma.safetyDocument.update({
      where: { id: c.req.param('id') },
      data: { status: map[decision], approvedBy: decision === 'approve' ? (u.name ?? 'Lab team') : null, approvedAt: decision === 'approve' ? new Date() : null },
    })
    const word = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : decision === 'hold' ? 'put on hold' : 'sent back for revision'
    if (doc.submittedById && doc.submittedById !== u.sub) {
      c.executionCtx?.waitUntil(notifyUser(c.env, doc.submittedById, { title: `Your RA was ${word}`, body: String(doc.title ?? ''), url: '/requests?tab=ra' }))
    }
    return c.json(doc)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// ── PPE & resource requests (same table, distinguished by `type`) ──
// Anyone submits; lab team approve/reject. Submitters see only their own.
function requestRoutes(kind: 'PPE' | 'RESOURCE', path: string) {
  safety.get(path, requireAuth, async (c) => {
    const prisma = getPrisma(c.env.DB)
    const u = c.get('user')
    const mine = !LAB_TEAM.includes(u.role)
    return c.json(
      await prisma.pPERequest.findMany({
        where: { tenantId: u.tenant, type: kind, ...(mine ? { userId: u.sub } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    )
  })

  safety.post(path, requireAuth, async (c) => {
    const prisma = getPrisma(c.env.DB)
    const u = c.get('user')
    const b = await c.req.json()
    if (!b.item || !b.quantity) return c.json({ error: 'item and quantity are required' }, 400)
    const req = await prisma.pPERequest.create({
      data: { tenantId: u.tenant, userId: u.sub, type: kind, item: b.item, quantity: Number(b.quantity), reason: b.reason },
    })
    return c.json(req, 201)
  })

  safety.post(`${path}/:id/:decision`, requireRole(...LAB_TEAM), async (c) => {
    const decision = c.req.param('decision')
    if (!['approve', 'reject'].includes(decision)) return c.json({ error: 'bad decision' }, 400)
    const prisma = getPrisma(c.env.DB)
    const u = c.get('user')
    const row = await prisma.pPERequest.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
    if (!row || row.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
    try {
      const req = await prisma.pPERequest.update({
        where: { id: c.req.param('id') },
        data: { status: decision === 'approve' ? 'approved' : 'rejected' },
      })
      return c.json(req)
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }
  })
}
requestRoutes('PPE', '/ppe')
requestRoutes('RESOURCE', '/resource')

export default safety
