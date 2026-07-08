// Lab scheduling — labs + weekly sessions with clash detection. Booking requests by any user.
// Read: all. Manage sessions: coordinator+ (LAB_COORDINATOR, LAB_MANAGER, ADMIN).
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, planLimit, type AuthVars } from '../middleware/auth'

const SCHEDULERS = ['LAB_COORDINATOR', 'LAB_MANAGER', 'ADMIN']
const schedule = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// Labs
schedule.get('/labs', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  return c.json(await prisma.lab.findMany({ where: { isActive: true, tenantId: u.tenant }, orderBy: { name: 'asc' } }))
})

const LAB_STR = ['name', 'building', 'floor', 'roomNo', 'departmentId', 'description', 'hvacDetails', 'floorPlanUrl', 'facilityNotes', 'pictureUrl', 'color', 'labDocuments']
const LAB_INT = ['capacity', 'chairs', 'tables', 'benches', 'sinks', 'fumeHoods']
function labData(b: Record<string, unknown>, partial: boolean) {
  const d: Record<string, unknown> = {}
  for (const k of LAB_STR) if (!partial || k in b) {
    if (k === 'name' || k === 'building') d[k] = b[k] == null ? '' : String(b[k]) // non-null columns
    else d[k] = b[k] === '' ? null : (b[k] ?? null)
  }
  for (const k of LAB_INT) if (!partial || k in b) {
    if (k === 'capacity') d[k] = b[k] == null || b[k] === '' ? 0 : Number(b[k])
    else d[k] = b[k] == null || b[k] === '' ? null : Number(b[k])
  }
  return d
}

// Create a lab (coordinator+/admin).
schedule.post('/labs', requireRole(...SCHEDULERS), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.name) return c.json({ error: 'name is required' }, 400)
  const limit = planLimit(u.plan, 'labs', u.status)
  if (limit != null) {
    const count = await prisma.lab.count({ where: { tenantId: u.tenant } })
    if (count >= limit) return c.json({ error: `Plan limit reached (${limit} lab${limit === 1 ? '' : 's'}). Upgrade to add more.`, limit }, 403)
  }
  const lab = await prisma.lab.create({ data: { ...labData(b, false), tenantId: u.tenant } as never })
  return c.json(lab, 201)
})

// Update a lab / its facilities (coordinator+/admin).
schedule.put('/labs/:id', requireRole(...SCHEDULERS), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const ex = await prisma.lab.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    const lab = await prisma.lab.update({ where: { id: c.req.param('id') }, data: labData(await c.req.json(), true) as never })
    return c.json(lab)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// Delete (deactivate) a lab — soft delete so existing references stay intact.
schedule.delete('/labs/:id', requireRole(...SCHEDULERS), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const ex = await prisma.lab.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    await prisma.lab.update({ where: { id: c.req.param('id') }, data: { isActive: false } })
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// Sessions for a lab (or all). Optional ?labId=
schedule.get('/sessions', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const labId = c.req.query('labId')
  return c.json(
    await prisma.labSession.findMany({
      where: { tenantId: u.tenant, ...(labId ? { labId } : {}) },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      include: { lab: { select: { name: true } } },
    }),
  )
})

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

schedule.post('/sessions', requireRole(...SCHEDULERS), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.labId || !b.title || b.dayOfWeek == null || !b.startTime || !b.endTime) {
    return c.json({ error: 'labId, title, dayOfWeek, startTime, endTime are required' }, 400)
  }
  // Clash detection — same lab + day, overlapping time (tenant-scoped). Checks recurring sessions
  // AND semester timetable entries on that weekday so the two scheduling systems can't double-book.
  const day = Number(b.dayOfWeek)
  const sameDay = await prisma.labSession.findMany({ where: { tenantId: u.tenant, labId: b.labId, dayOfWeek: day } })
  const clash = sameDay.find((s) => overlaps(b.startTime, b.endTime, s.startTime, s.endTime))
  if (clash) return c.json({ error: 'Time clash with an existing recurring session', clashWith: clash }, 409)
  if (!b.force) {
    const entries = await prisma.timetableEntry.findMany({ where: { tenantId: u.tenant, labId: b.labId, dayOfWeek: day } })
    const tt = entries.find((e) => overlaps(b.startTime, b.endTime, e.startTime, e.endTime))
    if (tt) return c.json({ error: `Clashes with a semester timetable booking in this lab (week ${tt.week}, ${tt.startTime}–${tt.endTime}).`, clash: true }, 409)
  }
  const session = await prisma.labSession.create({
    data: {
      tenantId: u.tenant,
      labId: b.labId,
      title: b.title,
      moduleCode: b.moduleCode,
      facultyName: b.facultyName,
      group: b.group,
      dayOfWeek: Number(b.dayOfWeek),
      startTime: b.startTime,
      endTime: b.endTime,
      isRecurring: b.isRecurring ?? true,
      semesterStart: b.semesterStart ? new Date(b.semesterStart) : null,
      semesterEnd: b.semesterEnd ? new Date(b.semesterEnd) : null,
      scheduledById: u.sub,
    },
  })
  return c.json(session, 201)
})

schedule.delete('/sessions/:id', requireRole(...SCHEDULERS), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const ex = await prisma.labSession.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    await prisma.labSession.delete({ where: { id: c.req.param('id') } })
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

export default schedule
