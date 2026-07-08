// LabSynch assistant — answers ONLY from data inside the app (no external AI / no API key).
// Keyword + fuzzy (typo-tolerant) intent routing over inventory, schedule, experiments,
// documents and request status. Always tenant-scoped, always returns direct links.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, type AuthVars } from '../middleware/auth'
import { callAI, providerLabel } from '../lib/ai'
import { withTimeout } from '../lib/net'

const WEB = 'https://labsynch.com'
const agent = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// So the assistant can answer "how do I…/where do I…" questions, not just data lookups.
const NAV_GUIDE = `LabSynch modules — for "how do I" / "where do I" questions, give a short step and link the right page:
- Inventory & assets (add and manage equipment, consumables, stock — use the Add button): ${WEB}/inventory
- Timetable & scheduling (lab sessions, clash detection): ${WEB}/timetable
- Service requests (3D print, laser cut, CNC): ${WEB}/requests
- Safety (risk assessments, SOPs, PPE requests): ${WEB}/safety
- Procurement (purchase requests, quotes, approvals): ${WEB}/procurement
- Maintenance (service logs and schedules): ${WEB}/maintenance
- Documents (SOPs, manuals, policies): ${WEB}/docs
- Experiments (definitions and required items): ${WEB}/experiments
- Activities (projects, research, coursework): ${WEB}/activities
- Issuances (borrowing and returns): ${WEB}/issuances
- Vendors (suppliers): ${WEB}/vendors
- Finance, CAPEX & OPEX (budgets and spend): ${WEB}/finance`

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const LAB_TEAM = ['LAB_TECHNICIAN', 'LAB_COORDINATOR', 'LAB_MANAGER', 'ADMIN']
const today = () => new Date().toISOString().slice(0, 10)
type AgentUser = { role: string; email?: string | null; sub: string }

// ── Fuzzy matching so typos still work ("filement" → "filament", "ocsilloscope" → "oscilloscope") ──
function lev(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n; if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[n]
}
const tol = (w: string) => (w.length <= 5 ? 1 : 2)
function fuzzyHit(hay: string, term: string): boolean {
  if (hay.includes(term)) return true
  if (term.length < 4) return false
  return hay.split(/[^a-z0-9]+/).some((w) => w.length >= 3 && lev(w, term) <= tol(term))
}
const words = (q: string) => q.split(/[^a-z0-9]+/).filter(Boolean)
const matches = (hay: string, terms: string[]) => terms.some((t) => fuzzyHit(hay, t))
// Intent detection that tolerates a misspelled keyword too.
function fhas(q: string, ...keys: string[]): boolean {
  const qw = words(q)
  return keys.some((k) => q.includes(k) || qw.some((x) => x.length >= 4 && lev(x, k) <= tol(k)))
}
// Generic words that shouldn't drive content matching — "how many PLA filament" must match on
// "pla"/"filament", not fuzzy-hit random items via "how"/"many"/"have".
const STOP = new Set(['the', 'and', 'for', 'are', 'you', 'your', 'our', 'with', 'from', 'does', 'did', 'how', 'many', 'much', 'what', 'which', 'show', 'list', 'give', 'all', 'any', 'please', 'can', 'tell', 'about', 'get', 'got', 'there', 'their', 'this', 'that', 'have', 'has', 'had', 'need', 'want', 'see', 'find', 'left', 'available', 'currently', 'total', 'number', 'count', 'item', 'items'])
const queryTerms = (q: string) => words(q).filter((t) => t.length > 2 && !STOP.has(t))

type Db = ReturnType<typeof getPrisma>

async function searchInventory(prisma: Db, q: string, tenantId: string) {
  const items = await prisma.inventoryItem.findMany({ where: { tenantId }, include: { lab: true }, take: 1000 })
  if (!items.length) return `No inventory yet. Add items: ${WEB}/inventory`
  const terms = queryTerms(q)
  const hits = terms.length ? items.filter((i) => matches(`${i.name} ${i.category} ${i.type} ${i.serialNumber ?? ''} ${i.lab?.name ?? ''} ${i.location ?? ''} ${i.subLocation ?? ''}`.toLowerCase(), terms)) : items
  // Asked about something specific but nothing matched → say so, don't hand back unrelated items.
  if (terms.length && !hits.length) return `No inventory item matches "${terms.join(' ')}" in this workspace.`
  const list = hits.slice(0, 20)
  const lines = list.map((i) => {
    const loc = i.lab?.name || i.location || i.subLocation
    const low = i.quantity <= i.minQuantity ? ' ⚠️ LOW STOCK' : ''
    const cur = i.priceCurrency || 'AED'
    const bits: string[] = []
    if (i.pricePerPiece != null) bits.push(`${cur} ${i.pricePerPiece}/pc`)
    if (i.pricePerBox != null) bits.push(`${cur} ${i.pricePerBox}/box`)
    if (i.pricePerDozen != null) bits.push(`${cur} ${i.pricePerDozen}/dozen`)
    const extra: string[] = []
    if (i.serialNumber) extra.push(`S/N ${i.serialNumber}`)
    if (i.ownership) extra.push(`owner ${i.ownership}`)
    if (i.stream) extra.push(String(i.stream))
    if (i.calibrationRequired) extra.push('calibration required')
    if (i.maintenanceRequired) extra.push('maintenance required')
    if (i.notes) extra.push(`note: ${i.notes}`)
    return `• ${i.name} — ${i.quantity}${i.unit ? ' ' + i.unit : ''} (${i.category})${loc ? ' · ' + loc : ''}${bits.length ? ' · price ' + bits.join(', ') : ''}${extra.length ? ' · ' + extra.join(' · ') : ''}${low}`
  })
  const head = terms.length ? `Found ${hits.length} matching item(s)` : `You have ${items.length} item(s)`
  return `${head}:\n${lines.join('\n')}`
}

async function getSchedule(prisma: Db, q: string, tenantId: string) {
  const sessions = await prisma.labSession.findMany({ where: { tenantId }, include: { lab: true }, take: 300 })
  if (!sessions.length) return `Nothing scheduled yet. Build a timetable: ${WEB}/timetable`
  const terms = queryTerms(q)
  const filtered = sessions.filter((s) => matches(`${s.lab.name} ${s.title} ${s.moduleCode ?? ''}`.toLowerCase(), terms))
  const list = (filtered.length ? filtered : sessions)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
    .slice(0, 14)
  const lines = list.map((s) => `• ${DAYS[s.dayOfWeek] ?? s.dayOfWeek} ${s.startTime}-${s.endTime}: ${s.title}${s.moduleCode ? ` (${s.moduleCode})` : ''} · ${s.lab.name}`)
  return `${filtered.length ? 'Matching sessions' : 'Lab schedule'}:\n${lines.join('\n')}\n\nFull timetable: ${WEB}/timetable`
}

async function searchExperiments(prisma: Db, q: string, tenantId: string) {
  const exps = await prisma.experiment.findMany({ where: { tenantId }, include: { subject: true, lab: true }, take: 400 })
  if (!exps.length) return `No experiments yet. Add one: ${WEB}/experiments`
  const terms = queryTerms(q)
  const hits = exps.filter((e) => matches(`${e.title} ${e.courseCode ?? ''} ${e.facultyName ?? ''} ${e.subject?.name ?? ''}`.toLowerCase(), terms))
  const list = (hits.length ? hits : exps).slice(0, 8)
  const lines = list.map((e) => {
    const docs = [e.experimentManualUrl, e.equipmentManualUrl, e.riskAssessmentUrl, e.safetyOperatingProcedureUrl, e.standardOperatingProcedureUrl].filter(Boolean).length
    return `• ${e.courseCode ? e.courseCode + ' — ' : ''}${e.title}${e.lab ? ` · ${e.lab.name}` : ''}${docs ? ` · ${docs} doc(s)` : ''}`
  })
  const head = hits.length ? `Found ${hits.length} matching experiment(s)` : `You have ${exps.length} experiment(s)`
  return `${head}:\n${lines.join('\n')}\n\nView all: ${WEB}/experiments · Timetable: ${WEB}/timetable`
}

async function searchDocs(prisma: Db, q: string, tenantId: string) {
  const docs = await prisma.document.findMany({ where: { tenantId }, take: 400 })
  if (!docs.length) return `No documents yet. Upload to the hub: ${WEB}/docs`
  const terms = queryTerms(q)
  const hits = docs.filter((d) => matches(`${d.title} ${d.category} ${d.tags ?? ''}`.toLowerCase(), terms))
  const list = (hits.length ? hits : docs).slice(0, 8)
  const lines = list.map((d) => `• ${d.title} (${d.category})${d.fileUrl ? `: ${d.fileUrl}` : ''}`)
  return `${hits.length ? 'Matching documents' : 'Documents'}:\n${lines.join('\n')}\n\nLibrary: ${WEB}/docs`
}

async function checkStatus(prisma: Db, q: string, tenantId: string) {
  const m = q.match(/req_\w+/)
  if (!m) return null
  const id = m[0]
  const r = await prisma.serviceRequest.findFirst({ where: { id, tenantId } })
  if (!r) return `No request "${id}" in your workspace. See your requests: ${WEB}/requests`
  return `Request "${r.title}" is ${r.status}. Details: ${WEB}/requests`
}

function formLink(q: string): string | null {
  const map: [string[], string, string][] = [
    [['3d', 'print', 'laser', 'cnc', 'service request', 'request'], 'Service requests', `${WEB}/requests`],
    [['ppe', 'goggles', 'glove', 'safety', 'risk'], 'Safety / PPE', `${WEB}/safety`],
    [['procure', 'purchase', 'buy', 'order', 'capex'], 'Procurement', `${WEB}/procurement`],
    [['vendor', 'supplier'], 'Vendors', `${WEB}/vendors`],
    [['maintenance', 'repair', 'calibration'], 'Maintenance', `${WEB}/maintenance`],
    [['activity', 'project', 'research', 'coursework'], 'Activities', `${WEB}/activities`],
    [['issuance', 'borrow', 'loan'], 'Issuances', `${WEB}/issuances`],
    [['experiment', 'practical'], 'Experiments', `${WEB}/experiments`],
    [['inventory', 'stock', 'equipment'], 'Inventory', `${WEB}/inventory`],
    [['schedule', 'timetable', 'booking'], 'Timetable', `${WEB}/timetable`],
    [['doc', 'sop', 'manual', 'policy'], 'Documentation', `${WEB}/docs`],
  ]
  for (const [keys, label, url] of map) if (fhas(q, ...keys)) return `${label}: ${url}`
  return null
}

async function lowStock(prisma: Db, tenantId: string) {
  const items = await prisma.inventoryItem.findMany({ where: { tenantId }, take: 1000 })
  const low = items.filter((i) => i.quantity <= i.minQuantity)
  if (!low.length) return `Good news — nothing is at or below minimum stock. Inventory: ${WEB}/inventory`
  const lines = low.slice(0, 12).map((i) => `• ${i.name} — ${i.quantity}${i.unit ? ' ' + i.unit : ''} (min ${i.minQuantity})`)
  return `${low.length} item(s) at/below minimum:\n${lines.join('\n')}\n\nReorder via Procurement: ${WEB}/procurement`
}

async function issuancesAnswer(prisma: Db, q: string, u: AgentUser, tenantId: string) {
  const labTeam = LAB_TEAM.includes(u.role)
  const where = labTeam ? { tenantId } : { tenantId, OR: [{ studentEmail: u.email }, { facultyEmail: u.email }, { supervisorEmail: u.email }] }
  const rows = await prisma.issuance.findMany({ where, include: { items: { include: { item: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 500 })
  if (!rows.length) return `No issuances ${labTeam ? '' : 'for you '}yet. Issuances: ${WEB}/issuances`
  const overdue = fhas(q, 'overdue', 'late', 'due')
  const terms = queryTerms(q)
  let list = rows
  if (overdue) list = rows.filter((r) => r.status !== 'RETURNED' && r.returnDate && String(r.returnDate).slice(0, 10) < today())
  else if (terms.length) list = rows.filter((r) => matches(`${r.studentName ?? ''} ${r.groupName ?? ''} ${r.courseCode ?? ''} ${r.items.map((it) => it.item?.name ?? it.customName ?? '').join(' ')}`.toLowerCase(), terms))
  if (!list.length) list = overdue ? [] : rows
  if (overdue && !list.length) return `No overdue borrowings 🎉 Issuances: ${WEB}/issuances`
  const lines = list.slice(0, 10).map((r) => `• ${r.studentName || r.groupName || 'Borrower'} — ${r.items.length} item(s) · ${r.status}${r.returnDate ? ' · due ' + String(r.returnDate).slice(0, 10) : ''}`)
  return `${overdue ? 'Overdue borrowings' : 'Issuances'}:\n${lines.join('\n')}\n\nView: ${WEB}/issuances`
}

async function activitiesAnswer(prisma: Db, q: string, u: AgentUser, tenantId: string) {
  const labTeam = LAB_TEAM.includes(u.role)
  const where = labTeam ? { tenantId } : { tenantId, OR: [{ userEmail: u.email }, { supervisorEmail: u.email }] }
  const rows = await prisma.activity.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 })
  if (!rows.length) return `No activities ${labTeam ? '' : 'for you '}yet. Activities: ${WEB}/activities`
  const terms = queryTerms(q)
  const hits = terms.length ? rows.filter((r) => matches(`${r.title} ${r.kind} ${r.userName ?? ''} ${r.supervisor ?? ''} ${r.courseCode ?? ''}`.toLowerCase(), terms)) : rows
  const list = (hits.length ? hits : rows).slice(0, 10)
  const lines = list.map((r) => `• ${r.title} (${r.kind})${r.userName ? ' · ' + r.userName : ''}${r.status === 'COMPLETED' ? ' · finished' : ''}`)
  return `${terms.length && hits.length ? 'Matching activities' : 'Activities'}:\n${lines.join('\n')}\n\nView: ${WEB}/activities`
}

async function requestsAnswer(prisma: Db, q: string, u: AgentUser, tenantId: string) {
  const staff = [...LAB_TEAM, 'FACULTY', 'DEAN', 'HEAD_OF_SCHOOL'].includes(u.role)
  const where = staff ? { tenantId } : { tenantId, userId: u.sub }
  const rows = await prisma.serviceRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500, include: { user: { select: { name: true } } } })
  if (!rows.length) return `No job requests ${staff ? '' : 'from you '}yet. Requests: ${WEB}/requests`
  const wantPending = fhas(q, 'pending', 'awaiting', 'approve', 'approval', 'review', 'to do')
  const terms = queryTerms(q).filter((t) => !['request', 'requests', 'job', 'jobs', 'pending', 'show', 'list'].includes(t))
  let list = wantPending ? rows.filter((r) => r.status === 'PENDING') : rows
  if (terms.length) list = list.filter((r) => matches(`${r.title} ${r.type} ${r.user?.name ?? ''}`.toLowerCase(), terms))
  if (!list.length) return `No ${wantPending ? 'pending ' : ''}job requests${terms.length ? ' matching that' : ''}. Requests: ${WEB}/requests`
  const lines = list.slice(0, 10).map((r) => `• ${r.title} — ${r.status}${r.user?.name ? ' · ' + r.user.name : ''}`)
  return `${wantPending ? 'Pending job requests' : 'Job requests'}:\n${lines.join('\n')}\n\nView: ${WEB}/requests`
}

async function procurementAnswer(prisma: Db, q: string, u: AgentUser, tenantId: string) {
  if (![...LAB_TEAM, 'LAB_MANAGER', 'HEAD_OF_SCHOOL', 'DEAN'].includes(u.role)) return `Procurement is managed by the lab team. ${WEB}/procurement`
  const rows = await prisma.procurementRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 500 })
  if (!rows.length) return `No procurement requests yet. ${WEB}/procurement`
  const wantPending = fhas(q, 'pending', 'submitted', 'awaiting', 'approve', 'approval')
  const list = wantPending ? rows.filter((r) => String(r.status) === 'submitted') : rows
  if (!list.length) return `No ${wantPending ? 'requests awaiting approval' : 'procurement requests'}. ${WEB}/procurement`
  const lines = list.slice(0, 10).map((r) => `• ${r.title} — ${String(r.status).replace('_', ' ')}`)
  return `${wantPending ? 'Awaiting approval' : 'Procurement requests'}:\n${lines.join('\n')}\n\nView: ${WEB}/procurement`
}

async function maintenanceSnapshot(prisma: Db, q: string, tenantId: string) {
  const [logs, schedules] = await Promise.all([
    prisma.maintenanceLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.maintenanceSchedule.findMany({ where: { tenantId }, orderBy: { nextDue: 'asc' }, take: 20 }),
  ])
  if (!logs.length && !schedules.length) return `No maintenance records yet. ${WEB}/maintenance`
  // Resolve equipment names in one extra query (avoids a Prisma include typing quirk).
  const itemIds = [...new Set([...logs.map((l) => l.itemId), ...schedules.map((s) => s.itemId)])]
  // Scope the name lookup to the caller's tenant too — defence in depth against any stale
  // cross-tenant itemId, so the assistant never surfaces another tenant's item name. #tenant-isolation
  const items = await prisma.inventoryItem.findMany({ where: { id: { in: itemIds }, tenantId }, select: { id: true, name: true } })
  const nameOf = new Map(items.map((i) => [i.id, i.name]))
  const now = today()
  const terms = queryTerms(q)
  const lg = (terms.length ? logs.filter((l) => matches(`${nameOf.get(l.itemId) ?? ''} ${l.type} ${l.description}`.toLowerCase(), terms)) : logs).slice(0, 12)
  const logLines = lg.map((l) => `• ${nameOf.get(l.itemId) ?? 'Item'} — ${l.type}${l.status ? ' · ' + l.status : ''}${l.cost != null ? ' · cost ' + l.cost : ''}${l.dueDate ? ' · due ' + String(l.dueDate).slice(0, 10) : ''}`)
  const schedLines = schedules.slice(0, 12).map((s) => `• ${nameOf.get(s.itemId) ?? 'Item'} — ${s.title} · every ${s.frequencyDays}d · next ${String(s.nextDue).slice(0, 10)}${String(s.nextDue).slice(0, 10) < now ? ' ⚠️ OVERDUE' : ''}`)
  return `Maintenance logs:\n${logLines.join('\n') || '—'}${schedLines.length ? '\nMaintenance schedules:\n' + schedLines.join('\n') : ''}`
}

async function vendorsSnapshot(prisma: Db, q: string, tenantId: string) {
  const vendors = await prisma.vendor.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, take: 100 })
  if (!vendors.length) return `No vendors yet. ${WEB}/vendors`
  const terms = queryTerms(q)
  const hits = terms.length ? vendors.filter((v) => matches(`${v.name} ${v.category ?? ''} ${v.country ?? ''} ${v.contactName ?? ''}`.toLowerCase(), terms)) : vendors
  const lines = (hits.length ? hits : vendors).slice(0, 15).map((v) => `• ${v.name}${v.category ? ' (' + v.category + ')' : ''}${v.country ? ' · ' + v.country : ''}${v.email ? ' · ' + v.email : ''}${v.isApproved ? ' · approved' : ''}`)
  return `Vendors:\n${lines.join('\n')}`
}

async function facilitiesSnapshot(prisma: Db, q: string, tenantId: string) {
  const labs = await prisma.lab.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, take: 200 })
  if (!labs.length) return `No labs/facilities yet. ${WEB}/facilities`
  const terms = queryTerms(q)
  const hits = terms.length ? labs.filter((l) => matches(`${l.name} ${l.building} ${l.roomNo ?? ''} ${l.description ?? ''}`.toLowerCase(), terms)) : labs
  if (terms.length && !hits.length) return `No lab or facility matches "${terms.join(' ')}".`
  const lines = hits.slice(0, 20).map((l) => `• ${l.name} — ${l.building}${l.floor ? ', floor ' + l.floor : ''}${l.roomNo ? ', room ' + l.roomNo : ''} · capacity ${l.capacity}${l.isActive === false ? ' · inactive' : ''}${l.description ? ' · ' + l.description : ''}`)
  const head = terms.length ? `Found ${hits.length} matching lab(s)` : 'Labs / facilities'
  return `${head}:\n${lines.join('\n')}`
}

// Search EVERY module for the query terms — powers the non-AI mode so ANY entry in the
// workspace can be found, not just pre-wired intents. Personal modules are role-scoped.
async function globalSearch(prisma: Db, q: string, u: AgentUser, tenantId: string): Promise<string | null> {
  const terms = queryTerms(q)
  if (!terms.length) return null
  const hit = (s: string) => matches(s.toLowerCase(), terms)
  const labTeam = LAB_TEAM.includes(u.role)
  const staff = [...LAB_TEAM, 'FACULTY', 'DEAN', 'HEAD_OF_SCHOOL'].includes(u.role)
  // Fan-out read across every module (bounded takes). Wrapped in a timeout so a slow/
  // contended D1 degrades to "nothing found" instead of hanging the assistant request.
  let all
  try {
    all = await withTimeout(Promise.all([
      prisma.inventoryItem.findMany({ where: { tenantId }, include: { lab: true }, take: 3000 }),
      prisma.lab.findMany({ where: { tenantId }, take: 500 }),
      prisma.vendor.findMany({ where: { tenantId }, take: 500 }),
      prisma.document.findMany({ where: { tenantId }, take: 1000 }),
      prisma.experiment.findMany({ where: { tenantId }, include: { lab: true }, take: 1000 }),
      prisma.labSession.findMany({ where: { tenantId }, include: { lab: true }, take: 1000 }),
      prisma.maintenanceLog.findMany({ where: { tenantId }, take: 1000 }),
      prisma.procurementRequest.findMany({ where: { tenantId }, take: 1000 }),
      prisma.activity.findMany({ where: labTeam ? { tenantId } : { tenantId, OR: [{ userEmail: u.email }, { supervisorEmail: u.email }] }, take: 1000 }),
      prisma.issuance.findMany({ where: labTeam ? { tenantId } : { tenantId, OR: [{ studentEmail: u.email }, { facultyEmail: u.email }, { supervisorEmail: u.email }] }, include: { items: { include: { item: { select: { name: true } } } } }, take: 1000 }),
      prisma.serviceRequest.findMany({ where: staff ? { tenantId } : { tenantId, userId: u.sub }, include: { user: { select: { name: true } } }, take: 1000 }),
    ]), 12000, 'global search')
  } catch { return null }
  const [items, labs, vendors, docs, exps, sessions, mlogs, procs, acts, isss, reqs] = all
  const out: string[] = []
  const invH = items.filter((i) => hit(`${i.name} ${i.category} ${i.type} ${i.serialNumber ?? ''} ${i.lab?.name ?? ''} ${i.location ?? ''} ${i.notes ?? ''}`))
  if (invH.length) out.push(`Inventory (${invH.length}):\n` + invH.slice(0, 12).map((i) => `• ${i.name} — ${i.quantity}${i.unit ? ' ' + i.unit : ''} (${i.category})${i.lab?.name ? ' · ' + i.lab.name : ''}${i.pricePerPiece != null ? ` · ${i.priceCurrency || 'AED'} ${i.pricePerPiece}/pc` : ''}`).join('\n'))
  const labH = labs.filter((l) => hit(`${l.name} ${l.building} ${l.roomNo ?? ''} ${l.description ?? ''}`))
  if (labH.length) out.push(`Labs/facilities (${labH.length}):\n` + labH.slice(0, 12).map((l) => `• ${l.name} — ${l.building}${l.roomNo ? ', room ' + l.roomNo : ''} · capacity ${l.capacity}`).join('\n'))
  const venH = vendors.filter((v) => hit(`${v.name} ${v.category ?? ''} ${v.country ?? ''} ${v.contactName ?? ''}`))
  if (venH.length) out.push(`Vendors (${venH.length}):\n` + venH.slice(0, 12).map((v) => `• ${v.name}${v.category ? ' (' + v.category + ')' : ''}${v.isApproved ? ' · approved' : ''}`).join('\n'))
  const docH = docs.filter((d) => hit(`${d.title} ${d.category} ${d.tags ?? ''}`))
  if (docH.length) out.push(`Documents (${docH.length}):\n` + docH.slice(0, 12).map((d) => `• ${d.title} (${d.category})${d.fileUrl ? ': ' + d.fileUrl : ''}`).join('\n'))
  const expH = exps.filter((e) => hit(`${e.title} ${e.courseCode ?? ''} ${e.facultyName ?? ''}`))
  if (expH.length) out.push(`Experiments (${expH.length}):\n` + expH.slice(0, 12).map((e) => `• ${e.courseCode ? e.courseCode + ' — ' : ''}${e.title}${e.lab ? ' · ' + e.lab.name : ''}`).join('\n'))
  const sesH = sessions.filter((s) => hit(`${s.lab.name} ${s.title} ${s.moduleCode ?? ''}`))
  if (sesH.length) out.push(`Schedule (${sesH.length}):\n` + sesH.slice(0, 12).map((s) => `• ${DAYS[s.dayOfWeek] ?? s.dayOfWeek} ${s.startTime}-${s.endTime}: ${s.title}${s.moduleCode ? ` (${s.moduleCode})` : ''} · ${s.lab.name}`).join('\n'))
  const mH = mlogs.filter((mm) => hit(`${mm.type} ${mm.description} ${mm.performedBy ?? ''}`))
  if (mH.length) out.push(`Maintenance (${mH.length}):\n` + mH.slice(0, 12).map((mm) => `• ${mm.type}${mm.status ? ' · ' + mm.status : ''}${mm.cost != null ? ' · cost ' + mm.cost : ''} — ${mm.description}`).join('\n'))
  const pH = procs.filter((p) => hit(`${p.title} ${p.description} ${p.supplier ?? ''} ${p.status}`))
  if (pH.length) out.push(`Procurement (${pH.length}):\n` + pH.slice(0, 12).map((p) => `• ${p.title} — ${String(p.status).replace('_', ' ')}${p.quotedAmount != null ? ` · ${p.currency} ${p.quotedAmount}` : ''}`).join('\n'))
  const aH = acts.filter((a) => hit(`${a.title} ${a.kind} ${a.userName ?? ''} ${a.supervisor ?? ''}`))
  if (aH.length) out.push(`Activities (${aH.length}):\n` + aH.slice(0, 12).map((a) => `• ${a.title} (${a.kind})${a.userName ? ' · ' + a.userName : ''}`).join('\n'))
  const iH = isss.filter((r) => hit(`${r.studentName ?? ''} ${r.groupName ?? ''} ${r.courseCode ?? ''} ${r.items.map((it) => it.item?.name ?? it.customName ?? '').join(' ')}`))
  if (iH.length) out.push(`Issuances (${iH.length}):\n` + iH.slice(0, 12).map((r) => `• ${r.studentName || r.groupName || 'Borrower'} — ${r.items.length} item(s) · ${r.status}`).join('\n'))
  const rH = reqs.filter((r) => hit(`${r.title} ${r.type} ${r.user?.name ?? ''}`))
  if (rH.length) out.push(`Requests (${rH.length}):\n` + rH.slice(0, 12).map((r) => `• ${r.title} — ${r.status}`).join('\n'))
  return out.length ? out.join('\n\n') : null
}

async function financeSnapshot(prisma: Db, tenantId: string) {
  // Totals must be exact, so these aren't capped — but they ARE time-bounded so a slow
  // D1 returns a friendly message instead of hanging.
  let data
  try {
    data = await withTimeout(Promise.all([
      prisma.opexExpense.findMany({ where: { tenantId } }),
      prisma.capexAsset.findMany({ where: { tenantId } }),
      prisma.maintenanceLog.findMany({ where: { tenantId, includeInOpex: true, cost: { not: null } } }),
      prisma.inventoryItem.findMany({ where: { tenantId, financeMode: 'CAPEX' }, select: { pricePerPiece: true, quantity: true } }),
    ]), 10000, 'finance snapshot')
  } catch { return 'The finance summary is taking too long right now — please try again in a moment.' }
  const [opexRecords, capexRecords, mntLogs, capexInv] = data
  const opexFromRecords = opexRecords.reduce((s, r) => s + (r.amount ?? 0), 0)
  const opexFromMnt = mntLogs.filter((m) => !['NOT_STARTED', 'IN_PROGRESS'].includes(String(m.status ?? ''))).reduce((s, m) => s + (m.cost ?? 0), 0)
  const opexTotal = opexFromRecords + opexFromMnt
  const capexTotal = capexRecords.reduce((s, r) => s + (r.cost ?? 0), 0) + capexInv.reduce((s, it) => s + (it.pricePerPiece ?? 0) * (it.quantity ?? 1), 0)
  return `Finance so far (AED):\n• OPEX total: ${opexTotal.toFixed(2)} (${opexRecords.length} expense record(s) + completed maintenance)\n• CAPEX total: ${capexTotal.toFixed(2)} (${capexRecords.length + capexInv.length} asset(s))`
}

// Admin: verify the workspace's AI key works with one tiny live call (any supported provider).
agent.post('/test', requireRole('ADMIN'), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const trow = await prisma.tenant.findUnique({ where: { id: u.tenant ?? '__none__' }, select: { aiApiKey: true } })
  const aiKey = trow?.aiApiKey || (c.env as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY
  if (!aiKey) return c.json({ ok: false, error: 'No API key saved yet — paste a key and Save first.' }, 400)
  const { text, provider, error } = await callAI(aiKey, 'Reply with just: OK', 'Say OK')
  if (text) return c.json({ ok: true, provider, providerLabel: provider ? providerLabel[provider] : 'Smart AI' })
  return c.json({ ok: false, provider, providerLabel: provider ? providerLabel[provider] : null, error: error ?? 'The key was rejected.' })
})

agent.post('/chat', requireAuth, async (c) => {
  const { message } = await c.req.json().catch(() => ({}))
  if (!message) return c.json({ error: 'message is required' }, 400)
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const tenantId = u.tenant ?? '__none__' // scope every answer to this user's workspace
  const q = String(message).toLowerCase()

  // If this workspace has its own AI key (Claude / ChatGPT / Gemini), let the model answer
  // naturally over the retrieved data. Falls back to the free keyword assistant on any failure.
  const trow = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiApiKey: true } })
  const aiKey = trow?.aiApiKey || (c.env as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY
  if (aiKey) {
    // Load ONLY the module(s) the question is about — keeps each request small (fewer tokens =
    // fewer rate limits) and focused. Inventory is the default when nothing else clearly matches.
    // Fetch every matched module IN PARALLEL (was sequential await — the main latency win).
    const jobs: Array<Promise<string>> = []
    if (fhas(q, 'schedule', 'timetable', 'session', 'class', 'booking', 'slot', 'free') || /\bwhen\b/.test(q)) jobs.push(getSchedule(prisma, q, tenantId))
    if (fhas(q, 'document', 'sop', 'manual', 'policy', 'risk', 'coshh', 'certificate', 'procedure', 'guide')) jobs.push(searchDocs(prisma, q, tenantId))
    if (fhas(q, 'experiment', 'practical', 'lab manual', 'course')) jobs.push(searchExperiments(prisma, q, tenantId))
    if (fhas(q, 'procurement', 'procure', 'purchase', 'order', 'capex', 'quote', 'invoice', 'po')) jobs.push(procurementAnswer(prisma, q, u, tenantId))
    if (fhas(q, 'activity', 'activities', 'project', 'research', 'coursework')) jobs.push(activitiesAnswer(prisma, q, u, tenantId))
    if (fhas(q, 'issuance', 'borrow', 'borrowed', 'loan', 'lent', 'issued', 'overdue', 'return')) jobs.push(issuancesAnswer(prisma, q, u, tenantId))
    if (fhas(q, 'request', 'requests', 'job', '3d', 'laser', 'cnc', 'ppe', 'pending', 'approval')) jobs.push(requestsAnswer(prisma, q, u, tenantId))
    if (fhas(q, 'maintenance', 'service', 'repair', 'calibration', 'amc', 'preventive', 'breakdown', 'overdue')) jobs.push(maintenanceSnapshot(prisma, q, tenantId))
    if (fhas(q, 'vendor', 'supplier', 'supplies')) jobs.push(vendorsSnapshot(prisma, q, tenantId))
    if (fhas(q, 'facility', 'facilities', 'room', 'building') || /\blabs?\b/.test(q)) jobs.push(facilitiesSnapshot(prisma, q, tenantId))
    if (fhas(q, 'opex', 'capex', 'budget', 'finance', 'spend', 'expense', 'expenditure')) jobs.push(financeSnapshot(prisma, tenantId))
    // Default to inventory (the most common) if nothing else matched, or when inventory is mentioned.
    if (!jobs.length || fhas(q, 'stock', 'inventory', 'item', 'equipment', 'consumable', 'price', 'cost', 'quantity', 'how many')) {
      jobs.unshift(searchInventory(prisma, q, tenantId))
    }
    const parts = await Promise.all(jobs)
    const ctx = parts.join('\n\n')
    const system = `You are LabSynch's friendly assistant for a university lab-management platform. Two jobs: (1) help users DO things in LabSynch and find the right page, and (2) answer questions from their live lab data below.

${NAV_GUIDE}

Guidelines:
- Answer ONLY what was asked, as briefly as possible. If they ask for one item's price, give just that — do NOT list other items or dump the whole inventory. Only show a list if they explicitly ask for one.
- Read the exact fields in the LAB DATA (each inventory line has name, quantity, location and, when set, price). Give the exact value; don't say it's unavailable if it's present.
- If the specific item, record or value asked about is NOT in the LAB DATA (e.g. it says "No inventory item matches…"), say you couldn't find it in their workspace — NEVER guess a number or infer it from a different item.
- Only include a link when the user asks WHERE/HOW to do something — never append "View all"/module links to a normal answer, even though such links appear in the data.
- Be concise and friendly. Only say something isn't available if it is genuinely not in the data or outside LabSynch.

=== LAB DATA ===
${ctx}`
    const { text } = await callAI(aiKey, system, String(message))
    if (text) return c.json({ reply: text, history: [] })
    // else fall through to the free keyword assistant
  }

  let reply: string | null = null

  // Greetings / small talk — a short reply, not a feature dump.
  if (/^\s*(hi+|hey+|hello|hiya|yo|howdy|thanks|thank\s*you|ok|okay|good\s+(morning|afternoon|evening))[\s!.]*$/.test(q)) {
    return c.json({ reply: 'Hi! Ask me about your inventory, schedule, maintenance, procurement, finance, vendors, requests or documents.', history: [] })
  }
  if (fhas(q, 'opex', 'capex', 'budget', 'finance', 'expenditure') || /\bspend\b/.test(q)) {
    reply = await financeSnapshot(prisma, tenantId)
  }
  if (!reply && /req_\w+/.test(q)) {
    reply = await checkStatus(prisma, q, tenantId)
  }
  if (!reply && (q.includes('low stock') || fhas(q, 'reorder', 'restock') || (fhas(q, 'low', 'running') && fhas(q, 'stock', 'inventory', 'item')))) {
    reply = await lowStock(prisma, tenantId)
  }
  if (!reply && fhas(q, 'issuance', 'borrow', 'borrowed', 'borrower', 'loan', 'lent', 'issued')) {
    reply = await issuancesAnswer(prisma, q, u, tenantId)
  }
  if (!reply && fhas(q, 'procurement', 'procure', 'purchase order', 'capex', 'po raised')) {
    reply = await procurementAnswer(prisma, q, u, tenantId)
  }
  if (!reply && fhas(q, 'activity', 'activities', 'project', 'research', 'coursework')) {
    reply = await activitiesAnswer(prisma, q, u, tenantId)
  }
  if (!reply && (fhas(q, 'request', 'requests') || (fhas(q, 'pending', 'awaiting', 'approve', 'approval', 'status', 'progress') && !fhas(q, 'stock', 'schedule', 'document')))) {
    reply = await requestsAnswer(prisma, q, u, tenantId)
  }
  if (!reply && fhas(q, 'experiment', 'practical', 'lab manual')) {
    reply = await searchExperiments(prisma, q, tenantId)
  }
  if (!reply && (fhas(q, 'stock', 'inventory', 'filament', 'printer', 'equipment', 'available', 'goggles', 'solder', 'oscilloscope', 'consumable') || /how many/.test(q))) {
    reply = await searchInventory(prisma, q, tenantId)
  }
  if (!reply && (fhas(q, 'schedule', 'timetable', 'session', 'class', 'booking', 'slot') || /\bwhen\b/.test(q))) {
    reply = await getSchedule(prisma, q, tenantId)
  }
  if (!reply && fhas(q, 'document', 'sop', 'manual', 'policy', 'guide', 'certificate', 'procedure')) {
    reply = await searchDocs(prisma, q, tenantId)
  }
  if (!reply && (fhas(q, 'where', 'link', 'form', 'submit', 'page', 'apply') || /how do i/.test(q))) {
    const f = formLink(q)
    if (f) reply = `Here you go — ${f}`
  }

  // Comprehensive fallback — search EVERY module for the term so any entry can be found.
  if (!reply) {
    try { reply = await globalSearch(prisma, q, u, tenantId) } catch { /* fall through to the help line */ }
  }
  if (!reply) {
    reply = "I couldn't find that anywhere in your workspace. Try a specific item, lab, vendor, request, document, experiment, procurement or maintenance name."
  }

  return c.json({ reply, history: [] })
})

export default agent
