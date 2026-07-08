// Semester timetable bookings, grouped by Term. Experiment or custom session.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'

const WRITE = [...LAB_TEAM, 'FACULTY']
const timetable = new Hono<{ Bindings: Env; Variables: AuthVars }>()

function data(b: Record<string, unknown>, tenantId: string | undefined) {
  return {
    tenantId,
    termId: (b.termId as string) || null,
    kind: String(b.kind ?? 'EXPERIMENT'),
    experimentId: b.kind === 'EXPERIMENT' ? (b.experimentId as string) || null : null,
    title: (b.title as string) || null,
    labId: (b.labId as string) || null,
    facultyName: (b.facultyName as string) || null,
    groups: b.groups != null && b.groups !== '' ? Number(b.groups) : null,
    week: Number(b.week) || 1,
    dayOfWeek: Number(b.dayOfWeek) || 0,
    startTime: String(b.startTime ?? ''),
    endTime: String(b.endTime ?? ''),
    notes: (b.notes as string) || null,
  }
}

const overlaps = (s1: string, e1: string, s2: string, e2: string) => !!s1 && !!e1 && !!s2 && !!e2 && s1 < e2 && s2 < e1

// Server-side clash detection: same lab/faculty in the same term+week, AND recurring lab sessions on that
// weekday. Returns a human message, or null if the slot is free.
async function clashMessage(prisma: ReturnType<typeof getPrisma>, tenantId: string | undefined, e: ReturnType<typeof data> & { id?: string }): Promise<string | null> {
  if (!e.startTime || !e.endTime || !e.labId) return null
  const sameWeek = await prisma.timetableEntry.findMany({ where: { tenantId, termId: e.termId, week: e.week, dayOfWeek: e.dayOfWeek, ...(e.id ? { id: { not: e.id } } : {}) }, include: { lab: { select: { name: true } } } })
  for (const o of sameWeek) {
    if (!overlaps(e.startTime, e.endTime, o.startTime, o.endTime)) continue
    if (o.labId === e.labId) return `That lab is already booked ${o.startTime}–${o.endTime} in week ${e.week}.`
    if (e.facultyName && o.facultyName === e.facultyName) return `${e.facultyName} is already booked ${o.startTime}–${o.endTime} in week ${e.week}.`
  }
  const recurring = await prisma.labSession.findMany({ where: { tenantId, labId: e.labId, dayOfWeek: e.dayOfWeek } })
  for (const s of recurring) if (overlaps(e.startTime, e.endTime, s.startTime, s.endTime)) return `Clashes with the recurring lab session “${s.title}” (${s.startTime}–${s.endTime}).`
  return null
}

// ── TERMS ─────────────────────────────────────
timetable.get('/terms', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const rows = await prisma.term.findMany({
    where: { tenantId: u.tenant },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { entries: true } } },
  })
  return c.json(rows)
})

timetable.post('/terms', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.name) return c.json({ error: 'name is required' }, 400)
  return c.json(await prisma.term.create({ data: { tenantId: u.tenant, name: b.name, startDate: b.startDate || null, weeks: Number(b.weeks) || 12, workDays: Array.isArray(b.workDays) ? JSON.stringify(b.workDays) : (b.workDays || null), dayStart: b.dayStart || null, dayEnd: b.dayEnd || null } }), 201)
})

timetable.put('/terms/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.term.findUnique({ where: { id: c.req.param('id') } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  return c.json(await prisma.term.update({ where: { id: c.req.param('id') }, data: { name: b.name, startDate: b.startDate || null, weeks: Number(b.weeks) || 12, workDays: Array.isArray(b.workDays) ? JSON.stringify(b.workDays) : (b.workDays ?? null), dayStart: b.dayStart || null, dayEnd: b.dayEnd || null } }))
})

timetable.delete('/terms/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.term.findUnique({ where: { id: c.req.param('id') } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.term.delete({ where: { id: c.req.param('id') } }) // cascades entries
  return c.json({ ok: true })
})

// Duplicate a whole term's timetable into a new term (next year / summer).
timetable.post('/terms/:id/duplicate', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const src = await prisma.term.findUnique({ where: { id: c.req.param('id') }, include: { entries: true } })
  if (!src || src.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  const term = await prisma.term.create({ data: { tenantId: u.tenant, name: b.name || `${src.name} (copy)`, startDate: b.startDate || null, weeks: Number(b.weeks) || src.weeks, workDays: src.workDays, dayStart: src.dayStart, dayEnd: src.dayEnd } })
  if (src.entries.length) {
    await prisma.timetableEntry.createMany({
      data: src.entries.map((e) => ({
        tenantId: u.tenant, termId: term.id, kind: e.kind, experimentId: e.experimentId, title: e.title,
        labId: e.labId, facultyName: e.facultyName, groups: e.groups, week: e.week, dayOfWeek: e.dayOfWeek,
        startTime: e.startTime, endTime: e.endTime, notes: e.notes,
      })),
    })
  }
  return c.json({ ...term, copied: src.entries.length }, 201)
})

// ── ENTRIES ───────────────────────────────────
timetable.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const labId = c.req.query('labId')
  const faculty = c.req.query('faculty')
  const week = c.req.query('week')
  const termId = c.req.query('termId')
  const rows = await prisma.timetableEntry.findMany({
    where: {
      tenantId: u.tenant,
      ...(termId ? { termId } : {}),
      ...(labId ? { labId } : {}),
      ...(faculty ? { facultyName: faculty } : {}),
      ...(week ? { week: Number(week) } : {}),
    },
    orderBy: [{ week: 'asc' }, { dayOfWeek: 'asc' }, { startTime: 'asc' }],
    include: {
      lab: { select: { name: true } },
      experiment: { include: { subject: { select: { color: true } }, items: { include: { item: { select: { name: true, type: true, quantity: true } } } } } },
    },
  })
  return c.json(rows)
})

timetable.post('/', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.startTime || !b.endTime) return c.json({ error: 'start and end time are required' }, 400)
  const d = data(b, u.tenant)
  if (!b.force) { const clash = await clashMessage(prisma, u.tenant, d); if (clash) return c.json({ error: clash, clash: true }, 409) }
  return c.json(await prisma.timetableEntry.create({ data: d }), 201)
})

timetable.put('/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.timetableEntry.findUnique({ where: { id: c.req.param('id') } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  const d = data(b, u.tenant)
  if (!b.force) { const clash = await clashMessage(prisma, u.tenant, { ...d, id: c.req.param('id') }); if (clash) return c.json({ error: clash, clash: true }, 409) }
  return c.json(await prisma.timetableEntry.update({ where: { id: c.req.param('id') }, data: d }))
})

timetable.delete('/:id', requireRole(...WRITE), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const existing = await prisma.timetableEntry.findUnique({ where: { id: c.req.param('id') } })
  if (!existing || existing.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  await prisma.timetableEntry.delete({ where: { id: c.req.param('id') } })
  return c.json({ ok: true })
})

export default timetable
