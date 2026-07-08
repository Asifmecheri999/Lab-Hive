// Flexible user-submitted portal requests (resource/borrowing, lab access, …).
// Submit: any logged-in user (sees own). Review/convert: lab team.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'
import { notifyUser } from '../lib/webpush'

const portal = new Hono<{ Bindings: Env; Variables: AuthVars }>()
const portalTab = (kind?: string | null) => (kind === 'PPE' ? 'ppe' : kind === 'ACCESS' ? 'access' : 'resource')

type LineItem = { name?: string; qty?: number; notes?: string; link?: string }
const parseItems = (s: string | null): LineItem[] => { try { const a = JSON.parse(s ?? '[]'); return Array.isArray(a) ? a : [] } catch { return [] } }

portal.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const kind = c.req.query('kind')
  const mine = !LAB_TEAM.includes(u.role) // submitters see only their own
  const hidden = await prisma.requestHide.findMany({ where: { userId: u.sub, refType: 'PORTAL' }, select: { refId: true } })
  const hideIds = hidden.map((h) => h.refId)
  return c.json(
    await prisma.portalRequest.findMany({
      where: { tenantId: u.tenant, ...(kind ? { kind } : {}), ...(mine ? { userId: u.sub } : {}), ...(hideIds.length ? { id: { notIn: hideIds } } : {}) },
      orderBy: { createdAt: 'desc' },
    }),
  )
})

portal.post('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.kind) return c.json({ error: 'kind is required' }, 400)
  const req = await prisma.portalRequest.create({
    data: {
      tenantId: u.tenant, userId: u.sub, kind: b.kind,
      submitterName: u.name ?? null, submitterEmail: u.email ?? null,
      data: b.data ? JSON.stringify(b.data) : null,
      items: b.items ? JSON.stringify(b.items) : null,
    },
  })
  return c.json(req, 201)
})

// Inventory availability check for a request's items (lab team).
portal.get('/:id/check', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const r = await prisma.portalRequest.findUnique({ where: { id: c.req.param('id') } })
  if (!r || r.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const items = parseItems(r.items)
  const inv = await prisma.inventoryItem.findMany({ where: { tenantId: u.tenant }, select: { id: true, name: true, quantity: true, unit: true } })
  const norm = (s: string) => s.toLowerCase().trim()
  const checked = items.map((it) => {
    const match = inv.find((iv) => norm(iv.name) === norm(String(it.name ?? '')))
    const need = Number(it.qty) || 1
    return { name: it.name ?? '', qty: need, inInventory: !!match, available: match ? match.quantity : null, ok: match ? match.quantity >= need : false }
  })
  return c.json({ items: checked })
})

// "Delete" = hide for me only. The other side keeps seeing it.
portal.delete('/:id', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const r = await prisma.portalRequest.findUnique({ where: { id: c.req.param('id') } })
  if (!r || r.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.requestHide.upsert({
    where: { userId_refType_refId: { userId: u.sub, refType: 'PORTAL', refId: r.id } },
    update: {},
    create: { tenantId: u.tenant, userId: u.sub, refType: 'PORTAL', refId: r.id },
  })
  return c.json({ ok: true })
})

// Review / push (lab team): approve | reject | hold | convert (→ issuance)
portal.post('/:id/:decision', requireRole(...LAB_TEAM), async (c) => {
  const decision = c.req.param('decision')
  const id = c.req.param('id')
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')

  if (decision === 'convert') {
    const r = await prisma.portalRequest.findUnique({ where: { id } })
    if (!r || r.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
    // Issuance is only possible once the request has been approved.
    if (r.status !== 'approved') return c.json({ error: 'Approve the request before pushing it to an issuance.' }, 400)
    const items = parseItems(r.items)
    let data: { school?: string; department?: string; purpose?: string; facultyName?: string; courseCode?: string; groupName?: string } = {}
    try { data = JSON.parse(r.data ?? '{}') } catch { data = {} }
    // Supervisor on the request is stored as "Name <email>" — split it so the issuance gets both.
    const supMatch = (data.facultyName ?? '').match(/^(.*?)\s*<([^>]+)>\s*$/)
    const supName = supMatch ? supMatch[1].trim() : (data.facultyName || null)
    const supEmail = supMatch ? supMatch[2].trim() : null
    const inv = await prisma.inventoryItem.findMany({ where: { tenantId: u.tenant }, select: { id: true, name: true } })
    const norm = (s: string) => s.toLowerCase().trim()
    const issuance = await prisma.issuance.create({
      data: {
        tenantId: u.tenant,
        studentName: r.submitterName, studentEmail: r.submitterEmail,
        school: data.school ?? null, department: data.department ?? null,
        supervisorName: supName, supervisorEmail: supEmail,
        courseCode: data.courseCode ?? null,
        groupInfo: data.groupName ?? null,
        status: 'ISSUED',
        notes: data.purpose ? `Borrowing for: ${data.purpose}` : null,
        items: {
          create: items.filter((it) => it.name).map((it) => {
            const match = inv.find((iv) => norm(iv.name) === norm(String(it.name ?? '')))
            return { itemId: match?.id ?? null, customName: match ? null : (it.name ?? null), quantity: Number(it.qty) || 1, unit: 'PIECE', consumed: false }
          }),
        },
      },
    })
    await prisma.portalRequest.update({ where: { id }, data: { status: 'issued' } })
    if (r.userId && r.userId !== u.sub) c.executionCtx?.waitUntil(notifyUser(c.env, r.userId, { title: 'Your request was issued', body: 'Items have been issued to you.', url: `/requests?tab=${portalTab(r.kind)}` }))
    return c.json({ ok: true, issuanceId: issuance.id })
  }

  const map: Record<string, string> = { approve: 'approved', reject: 'rejected', hold: 'hold' }
  if (!map[decision]) return c.json({ error: 'bad decision' }, 400)
  const { count } = await prisma.portalRequest.updateMany({ where: { id, tenantId: u.tenant }, data: { status: map[decision] } })
  if (count === 0) return c.json({ error: 'Not found' }, 404)
  const r = await prisma.portalRequest.findUnique({ where: { id } })
  if (r && r.userId && r.userId !== u.sub) {
    const word = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'put on hold'
    c.executionCtx?.waitUntil(notifyUser(c.env, r.userId, { title: `Your request was ${word}`, body: '', url: `/requests?tab=${portalTab(r.kind)}` }))
  }
  return c.json(r)
})

export default portal
