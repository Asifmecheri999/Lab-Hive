// Two-way communication threads on any request (job / RA / portal). Re-uploaded files are kept as history.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, LAB_TEAM, type AuthVars } from '../middleware/auth'
import { notifyEach, labTeamIds } from '../lib/notify'

const comments = new Hono<{ Bindings: Env; Variables: AuthVars }>()

const STAFF = ['LAB_TECHNICIAN', 'LAB_COORDINATOR', 'LAB_MANAGER', 'ADMIN', 'DEAN', 'HEAD_OF_SCHOOL']

type Parent = { tenantId: string | null; ownerId: string | null; supervisor: string | null; title: string | null } | null
type AuthedUser = { sub: string; tenant: string | null; role: string; email?: string | null; name?: string | null }
// Load the request a thread hangs off (tenant + owner + a human title), so we can authorize
// access AND tell the recipient which request a new message belongs to.
async function parentOf(prisma: ReturnType<typeof getPrisma>, refType: string, refId: string): Promise<Parent> {
  if (refType === 'JOB') { const r = await prisma.serviceRequest.findUnique({ where: { id: refId }, select: { tenantId: true, userId: true, title: true } }); return r ? { tenantId: r.tenantId, ownerId: r.userId, supervisor: null, title: r.title } : null }
  if (refType === 'PORTAL') { const r = await prisma.portalRequest.findUnique({ where: { id: refId }, select: { tenantId: true, userId: true, kind: true } }); return r ? { tenantId: r.tenantId, ownerId: r.userId, supervisor: null, title: r.kind === 'PPE' ? 'PPE request' : r.kind === 'ACCESS' ? 'Lab access request' : 'Resource request' } : null }
  if (refType === 'RA') { const r = await prisma.safetyDocument.findUnique({ where: { id: refId }, select: { tenantId: true, submittedById: true, supervisor: true, title: true } }); return r ? { tenantId: r.tenantId, ownerId: r.submittedById, supervisor: r.supervisor, title: r.title } : null }
  return null
}
// Staff (lab team + leadership + faculty reviewers) see any thread in their tenant; others only their own requests.
function canAccessThread(u: AuthedUser, parent: Parent): boolean {
  if (!parent || parent.tenantId !== u.tenant) return false
  if (STAFF.includes(u.role) || u.role === 'FACULTY') return true
  if (parent.ownerId && parent.ownerId === u.sub) return true
  const sup = parent.supervisor ?? ''
  if (sup && ((u.email && sup.includes(u.email)) || (u.name && sup.includes(u.name)))) return true
  return false
}

// GET /api/comments?refType=JOB&refId=...
comments.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const refType = c.req.query('refType')
  const refId = c.req.query('refId')
  if (!refType || !refId) return c.json({ error: 'refType and refId are required' }, 400)
  const parent = await parentOf(prisma, refType, refId)
  if (!canAccessThread(u, parent)) return c.json([]) // not your request — show nothing instead of leaking the thread
  return c.json(
    await prisma.requestComment.findMany({ where: { tenantId: u.tenant, refType, refId }, orderBy: { createdAt: 'asc' } }),
  )
})

// GET /api/comments/feed — recent messages addressed to me (for notifications).
comments.get('/feed', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  if (STAFF.includes(u.role)) {
    // Staff: messages from requesters (non-staff authors).
    const rows = await prisma.requestComment.findMany({
      where: { tenantId: u.tenant, authorId: { not: u.sub }, authorRole: { notIn: STAFF } },
      orderBy: { createdAt: 'desc' }, take: 50,
    })
    return c.json(await withKind(prisma, rows))
  }
  // Requester: messages on requests I submitted, from someone else. Only look at the
  // user's RECENT requests — bounding these keeps the `refId IN (…)` list small so this
  // notification-poll endpoint stays fast even for a user with thousands of requests.
  const [jobs, portals, ras] = await Promise.all([
    prisma.serviceRequest.findMany({ where: { userId: u.sub }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.portalRequest.findMany({ where: { userId: u.sub }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.safetyDocument.findMany({ where: { submittedById: u.sub, type: 'RA' }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
  ])
  const ids = [...jobs, ...portals, ...ras].map((x) => x.id)
  if (!ids.length) return c.json([])
  const rows = await prisma.requestComment.findMany({
    where: { tenantId: u.tenant, refId: { in: ids }, authorId: { not: u.sub } },
    orderBy: { createdAt: 'desc' }, take: 50,
  })
  return c.json(await withKind(prisma, rows))
})

// Attach the portal `kind` (PPE/RESOURCE/ACCESS) to PORTAL comments so notifications can deep-link to the right tab.
async function withKind(prisma: ReturnType<typeof getPrisma>, rows: { refType: string; refId: string }[]) {
  const portalIds = rows.filter((r) => r.refType === 'PORTAL').map((r) => r.refId)
  if (!portalIds.length) return rows
  const ps = await prisma.portalRequest.findMany({ where: { id: { in: portalIds } }, select: { id: true, kind: true } })
  const kindOf = new Map(ps.map((p) => [p.id, p.kind]))
  return rows.map((r) => (r.refType === 'PORTAL' ? { ...r, kind: kindOf.get(r.refId) ?? null } : r))
}

// POST /api/comments  { refType, refId, body?, fileUrl?, attachments?: [{label,url}] }
comments.post('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.refType || !b.refId) return c.json({ error: 'refType and refId are required' }, 400)
  const parent = await parentOf(prisma, b.refType, b.refId)
  if (!canAccessThread(u, parent)) return c.json({ error: 'Not found' }, 404) // can't post to a thread you can't see
  const atts: { label?: string; url?: string }[] = Array.isArray(b.attachments) ? b.attachments.filter((a: { url?: string }) => a && a.url) : []
  const firstUrl = b.fileUrl ?? atts[0]?.url ?? null
  if (!b.body && !firstUrl) return c.json({ error: 'Add a message or a file' }, 400)
  const comment = await prisma.requestComment.create({
    data: {
      tenantId: u.tenant, refType: b.refType, refId: b.refId,
      authorId: u.sub, authorName: u.name ?? null, authorRole: u.role ?? null,
      body: b.body ?? null, fileUrl: firstUrl,
      attachments: atts.length ? JSON.stringify(atts) : null,
    },
  })
  // If the submitter re-uploads a revised RA, refresh the document + reopen review — only their own RA, in their tenant.
  if (b.refType === 'RA' && firstUrl && !LAB_TEAM.includes(u.role)) {
    await prisma.safetyDocument.updateMany({ where: { id: b.refId, tenantId: u.tenant, submittedById: u.sub }, data: { fileUrl: firstUrl, status: 'submitted' } }).catch(() => {})
  }
  // Notify everyone on the thread except the author: the request owner AND the whole lab team
  // (so admins/coordinators see student messages too, not just the one handler). The title names
  // the request so recipients know which one the message is about; the tile lights up via refId.
  try {
    const ownerId = parent?.ownerId ?? null
    const url = b.refType === 'RA' ? '/requests?tab=ra' : b.refType === 'JOB' ? '/requests?tab=jobs' : '/requests'
    const label = parent?.title ? String(parent.title) : 'your request'
    const payload = { type: 'COMMENT', event: 'MESSAGE', title: `New message: ${label}`, body: `${u.name ?? 'Someone'}: ${String(b.body ?? 'Sent a file')}`, refType: String(b.refType), refId: String(b.refId), url }
    c.executionCtx?.waitUntil((async () => {
      const recipients = new Set<string>()
      if (ownerId) recipients.add(ownerId)                                    // the person who raised the request
      for (const id of await labTeamIds(c.env, u.tenant ?? undefined)) recipients.add(id) // the whole lab team
      recipients.delete(u.sub)                                               // never notify the author
      await notifyEach(c.env, [...recipients], u.tenant ?? undefined, payload)
    })())
  } catch { /* notifications are best-effort */ }
  return c.json(comment, 201)
})

export default comments
