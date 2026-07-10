// Service requests (3D print, laser cut, etc.) — the student lab-service workflow.
// Create: any logged-in user. Approve/reject: Faculty (+Dean/Admin). Process (status): Lab Technician+.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'
import { notify, notifyEach, labTeamIds } from '../lib/notify'

const TYPES = ['THREE_D_PRINT', 'LASER_CUT', 'CNC', 'SUPERVISED_SESSION', 'EQUIPMENT_USE', 'OTHER']
const STATUSES = ['PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'HOLD']
const APPROVE_ROLES = ['FACULTY', 'DEAN', 'ADMIN']
const DECISION_ROLES = [...APPROVE_ROLES, ...LAB_TEAM]

const requests = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// List: students AND faculty see their own; lab team / Dean / HoS see all.
// (Faculty do not review students' job requests — they only submit their own.)
requests.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const staff = [...LAB_TEAM, 'DEAN', 'ADMIN', 'HEAD_OF_SCHOOL'].includes(u.role)
  const hidden = await prisma.requestHide.findMany({ where: { userId: u.sub, refType: 'JOB' }, select: { refId: true } })
  const hideIds = hidden.map((h) => h.refId)
  return c.json(
    await prisma.serviceRequest.findMany({
      where: { tenantId: u.tenant, ...(staff ? {} : { userId: u.sub }), ...(hideIds.length ? { id: { notIn: hideIds } } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } }, approvals: true },
    }),
  )
})

// "Delete" = hide for me only. The other side (requester ⟷ lab team) keeps seeing it.
requests.delete('/:id', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const r = await prisma.serviceRequest.findUnique({ where: { id: c.req.param('id') } })
  if (!r || r.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.requestHide.upsert({
    where: { userId_refType_refId: { userId: u.sub, refType: 'JOB', refId: r.id } },
    update: {},
    create: { tenantId: u.tenant, userId: u.sub, refType: 'JOB', refId: r.id },
  })
  return c.json({ ok: true })
})

requests.get('/:id', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const r = await prisma.serviceRequest.findUnique({
    where: { id: c.req.param('id') },
    include: { user: { select: { name: true, email: true } }, approvals: true },
  })
  if (!r || r.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  return c.json(r)
})

requests.post('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.type || !b.title || !b.description) {
    return c.json({ error: 'type, title and description are required' }, 400)
  }
  if (!TYPES.includes(b.type)) return c.json({ error: `type must be one of ${TYPES.join(', ')}` }, 400)
  const r = await prisma.serviceRequest.create({
    data: {
      tenantId: u.tenant,
      type: b.type,
      title: b.title,
      description: b.description,
      fileUrl: b.fileUrl, // R2 URL (optional until R2 enabled)
      attachments: Array.isArray(b.attachments) ? JSON.stringify(b.attachments) : (b.attachments ?? null),
      material: b.material,
      quantity: b.quantity != null && b.quantity !== '' ? Number(b.quantity) : null,
      notes: b.notes,
      preferredDate: b.preferredDate ? new Date(b.preferredDate) : null,
      urgentReason: b.urgentReason || null,
      studentId: b.studentId || null,
      course: b.course || null,
      supervisor: b.supervisor || null,
      school: b.school || null,
      department: b.department || null,
      userId: u.sub,
    },
  })
  // Alert the lab team that a new job request needs handling.
  c.executionCtx?.waitUntil((async () => {
    const ids = (await labTeamIds(c.env, u.tenant)).filter((id) => id !== u.sub)
    await notifyEach(c.env, ids, u.tenant, { type: 'JOB', event: 'SUBMITTED', title: `New job request: ${r.title}`, body: u.name ?? '', refType: 'JOB', refId: r.id, url: '/requests?tab=jobs' })
  })())
  return c.json(r, 201)
})

// Approve / reject / hold — records an Approval (with the review note) and sets status.
requests.post('/:id/:decision', requireRole(...DECISION_ROLES), async (c) => {
  const decision = c.req.param('decision')
  const map: Record<string, string> = { approve: 'APPROVED', reject: 'REJECTED', hold: 'HOLD' }
  const status = map[decision]
  if (!status) return c.json({ error: 'decision must be approve, reject or hold' }, 400)
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const { comments } = await c.req.json().catch(() => ({}))
  const id = c.req.param('id')
  const existing = await prisma.serviceRequest.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)

  await prisma.approval.create({
    data: { tenantId: u.tenant, requestId: id, approverId: u.sub, status, comments, decidedAt: new Date() },
  })
  const r = await prisma.serviceRequest.update({ where: { id }, data: { status } })
  // Notify the requester of the decision.
  const word = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'put on hold'
  if (existing.userId && existing.userId !== u.sub) {
    c.executionCtx?.waitUntil(notify(c.env, existing.userId, u.tenant, { type: 'JOB', event: status, title: `Your job request was ${word}`, body: comments ? String(comments) : String(existing.title ?? ''), refType: 'JOB', refId: id, url: '/requests?tab=jobs' }))
  }
  return c.json(r)
})

// Lab technician advances processing status (IN_PROGRESS / COMPLETED).
requests.patch('/:id/status', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const { status } = await c.req.json()
  if (!STATUSES.includes(status)) return c.json({ error: `status must be one of ${STATUSES.join(', ')}` }, 400)
  const { count } = await prisma.serviceRequest.updateMany({ where: { id, tenantId: u.tenant }, data: { status } })
  if (count === 0) return c.json({ error: 'Not found' }, 404)
  const r = await prisma.serviceRequest.findUnique({ where: { id } })
  const word = status === 'IN_PROGRESS' ? 'is now in progress' : status === 'COMPLETED' ? 'is complete' : `is now ${String(status).toLowerCase()}`
  if (r?.userId && r.userId !== u.sub) {
    c.executionCtx?.waitUntil(notify(c.env, r.userId, u.tenant, { type: 'JOB', event: status, title: `Your job request ${word}`, body: String(r.title ?? ''), refType: 'JOB', refId: id, url: '/requests?tab=jobs' }))
  }
  return c.json(r)
})

export default requests
