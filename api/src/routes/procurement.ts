// Procurement requests with CAPEX/OPEX tagging + approval chain.
// Create: lab team. Approve/advance status: Lab Manager -> Head of School -> Dean.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireAuth, requireRole, LAB_TEAM, APPROVERS, type AuthVars } from '../middleware/auth'
import { sendEmail, mailLayout, mailButton, mailPanel } from '../lib/email'

const ALL_LAB = [...LAB_TEAM, 'HEAD_OF_SCHOOL', 'DEAN', 'ADMIN']
const APP_URL = 'https://labsynch.com'
const STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'on_hold', 'ordered', 'sent_to_erp', 'delivered']
const procurement = new Hono<{ Bindings: Env; Variables: AuthVars }>()

type Line = { itemId?: string; customName?: string; category?: string; quantity?: number; unit?: string; estPrice?: number; link?: string; imageUrl?: string; notes?: string }
// Keep only line items whose inventory item belongs to the caller's tenant — drop any body-supplied
// itemId pointing at another tenant's InventoryItem (it would leak the item's name/type via the
// item include, and let /receive touch that item's stock). Custom lines have no itemId. #tenant-isolation
async function mapOwnedItems(prisma: ReturnType<typeof getPrisma>, b: { items?: Line[] }, tenant?: string) {
  const raw = (Array.isArray(b.items) ? b.items : []).filter((l) => l.itemId || l.customName)
  const ids = [...new Set(raw.map((l) => l.itemId).filter(Boolean) as string[])]
  const owned = ids.length && tenant
    ? new Set((await prisma.inventoryItem.findMany({ where: { id: { in: ids }, tenantId: tenant }, select: { id: true } })).map((i) => i.id))
    : new Set<string>()
  return raw
    .filter((l) => !l.itemId || owned.has(l.itemId))
    .map((l) => ({ itemId: l.itemId || null, customName: l.customName || null, category: l.category || null, quantity: Number(l.quantity) || 1, unit: l.unit || 'PIECE', estPrice: l.estPrice != null && l.estPrice !== ('' as unknown) ? Number(l.estPrice) : null, link: l.link || null, imageUrl: l.imageUrl || null, notes: l.notes || null }))
}
const INC = { vendor: true, items: { include: { item: { select: { name: true, type: true } } } } }

// Lab team + approvers see everything; a faculty approver sees the requests assigned to
// them (or they raised) PLUS any already-approved requisition (read-only visibility).
const FACULTY_VISIBLE = ['approved', 'ordered', 'sent_to_erp', 'delivered']
procurement.get('/', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const status = c.req.query('status')
  const canAll = ALL_LAB.includes(u.role)
  const or: Record<string, unknown>[] = [{ approverEmail: u.email }, { submittedById: u.sub }]
  if (u.role === 'FACULTY') or.push({ status: { in: FACULTY_VISIBLE } })
  const where = canAll
    ? { tenantId: u.tenant, ...(status ? { status } : {}) }
    : { tenantId: u.tenant, ...(status ? { status } : {}), OR: or }
  return c.json(await prisma.procurementRequest.findMany({ where, orderBy: { createdAt: 'desc' }, include: INC }))
})

// ── Quote collection (RFQ comparison sheets) ──
// Read: any authenticated user in the tenant (faculty view them read-only); write: lab team.
procurement.get('/quotes', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  return c.json(await prisma.quoteSheet.findMany({ where: { tenantId: u.tenant }, orderBy: { updatedAt: 'desc' } }))
})
procurement.post('/quotes', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json().catch(() => ({}))
  if (!b.title) return c.json({ error: 'title is required' }, 400)
  const data = b.data === undefined ? null : (typeof b.data === 'string' ? b.data : JSON.stringify(b.data))
  return c.json(await prisma.quoteSheet.create({ data: { tenantId: u.tenant, title: String(b.title), data } }), 201)
})
procurement.put('/quotes/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const ex = await prisma.quoteSheet.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const d: Record<string, unknown> = {}
  if (b.title !== undefined) d.title = b.title
  if (b.data !== undefined) d.data = typeof b.data === 'string' ? b.data : JSON.stringify(b.data)
  try { return c.json(await prisma.quoteSheet.update({ where: { id: c.req.param('id') }, data: d })) }
  catch { return c.json({ error: 'Not found' }, 404) }
})
procurement.delete('/quotes/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const ex = await prisma.quoteSheet.findUnique({ where: { id: c.req.param('id') }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try { await prisma.quoteSheet.delete({ where: { id: c.req.param('id') } }); return c.json({ ok: true }) }
  catch { return c.json({ error: 'Not found' }, 404) }
})
// Email a saved quote request to a vendor / the procurement department.
procurement.post('/quotes/:id/send', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const to = String((await c.req.json().catch(() => ({}))).to ?? '').trim()
  if (!to) return c.json({ error: 'recipient email is required' }, 400)
  const qs = await prisma.quoteSheet.findUnique({ where: { id: c.req.param('id') } })
  if (!qs || qs.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  let d: { items?: { name?: string; qty?: number | string; link?: string; notes?: string }[]; message?: string } = {}
  try { d = JSON.parse(qs.data ?? '{}') } catch { /* ignore */ }
  const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m] as string))
  const items = Array.isArray(d.items) ? d.items : []
  const cell = 'padding:6px 10px;border:1px solid #e5e7eb;font-size:13px'
  const rows = items.map((it) => `<tr><td style="${cell}">${esc(it.name)}</td><td style="${cell};text-align:center">${esc(it.qty)}</td><td style="${cell}">${it.link ? `<a href="${esc(it.link)}">link</a>` : ''}</td><td style="${cell}">${esc(it.notes)}</td></tr>`).join('')
  const html = mailLayout(`Quote request: ${esc(qs.title)}`, `${d.message ? `<p>${esc(d.message)}</p>` : ''}<table style="border-collapse:collapse;width:100%"><thead><tr><th style="${cell};background:#0A1628;color:#fff">Item</th><th style="${cell};background:#0A1628;color:#fff">Qty</th><th style="${cell};background:#0A1628;color:#fff">Link</th><th style="${cell};background:#0A1628;color:#fff">Notes</th></tr></thead><tbody>${rows}</tbody></table><p style="color:#64748b">Please send us your best quotation for the above. Thank you.</p>`)
  const text = `Quote request: ${qs.title}\n\n${items.map((it) => `- ${it.name} × ${it.qty}${it.link ? ` (${it.link})` : ''}${it.notes ? ` — ${it.notes}` : ''}`).join('\n')}`
  const ok = await sendEmail(c.env, { to, subject: `Quote request — ${qs.title}`, html, text })
  return c.json({ ok })
})

// Pickable approvers — only users explicitly ticked as "approver" in Users (not everyone by role).
procurement.get('/approvers', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const list = await prisma.user.findMany({
    where: { tenantId: u.tenant, isApprover: true },
    select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' },
  })
  return c.json(list)
})

procurement.post('/', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const b = await c.req.json()
  if (!b.title) return c.json({ error: 'title is required' }, 400)
  const p = await prisma.procurementRequest.create({
    data: {
      tenantId: u.tenant,
      budgetType: ['CAPEX', 'OPEX'].includes(b.budgetType) ? b.budgetType : 'OPEX',
      budgetYear: b.budgetYear != null && b.budgetYear !== '' ? Number(b.budgetYear) : null,
      approverEmail: b.approverEmail || null,
      approverName: b.approverName || null,
      external: !!b.external,
      vatPercent: b.vatPercent != null && b.vatPercent !== '' ? Number(b.vatPercent) : null,
      vendorQuotes: Array.isArray(b.vendorQuotes) ? JSON.stringify(b.vendorQuotes) : (b.vendorQuotes ?? null),
      documents: Array.isArray(b.documents) ? JSON.stringify(b.documents) : (b.documents ?? null),
      kind: b.kind || 'QUOTE',
      title: b.title,
      description: b.description ?? '',
      supplier: b.supplier,
      campus: b.campus || null,
      department: b.department || null,
      lab: b.lab || null,
      quotedAmount: b.quotedAmount != null && b.quotedAmount !== '' ? Number(b.quotedAmount) : null,
      currency: b.currency ?? 'AED',
      invoiceUrl: b.invoiceUrl,
      quotationUrl: b.quotationUrl,
      status: b.status ?? 'draft',
      vendorId: b.vendorId || null,
      submittedById: u.sub,
      items: { create: await mapOwnedItems(prisma, b, u.tenant) },
    },
    include: INC,
  })
  return c.json(p, 201)
})

// Advance status. submit/order/deliver → lab team or the creator. approve/reject/hold → an approver
// role OR the specific person it was routed to. Emails the right party on each transition.
procurement.patch('/:id/status', requireAuth, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const { status, erpReference, note } = await c.req.json()
  if (!STATUSES.includes(status)) return c.json({ error: `status must be one of ${STATUSES.join(', ')}` }, 400)
  const req = await prisma.procurementRequest.findUnique({ where: { id: c.req.param('id') } })
  if (!req || req.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)

  const isDecision = ['approved', 'rejected', 'on_hold'].includes(status)
  const isApprover = APPROVERS.includes(u.role) || (!!req.approverEmail && req.approverEmail.toLowerCase() === String(u.email ?? '').toLowerCase())
  const isOwnerSide = LAB_TEAM.includes(u.role) || req.submittedById === u.sub
  if (isDecision && !isApprover) return c.json({ error: 'Only the assigned approver (or an approver role) can decide this request.' }, 403)
  if (!isDecision && !isOwnerSide) return c.json({ error: 'Only the lab team or the creator can change this.' }, 403)

  const p = await prisma.procurementRequest.update({ where: { id: req.id }, data: {
    status, ...(erpReference ? { erpReference } : {}),
    ...(isDecision ? { decisionNote: note ? String(note) : null, approverName: req.approverName || u.name || u.email || null } : {}),
    ...(status === 'submitted' ? { decisionNote: null } : {}),
  } })

  // Notifications (best-effort).
  try {
    if (status === 'submitted' && req.approverEmail) {
      await sendEmail(c.env, { to: req.approverEmail, subject: `Approval needed — ${req.title}`,
        html: mailLayout('A purchase request needs your approval', `<p style="margin:0 0 4px;"><b>${req.title}</b> has been submitted for your approval.</p><p style="margin:0;">Review the details and approve, hold, or reject it:</p>${mailButton(`${APP_URL}/approvals`, 'Review the request')}`, `Approval needed: ${req.title}`),
        text: `${req.title} needs your approval. Review at ${APP_URL}/approvals` })
    } else if (isDecision && req.submittedById) {
      const creator = await prisma.user.findUnique({ where: { id: req.submittedById }, select: { email: true } })
      if (creator?.email) await sendEmail(c.env, { to: creator.email, subject: `Purchase request ${status} — ${req.title}`,
        html: mailLayout(`Purchase request ${status.replace('_', ' ')}`, `<p style="margin:0 0 8px;">Your purchase request <b>${req.title}</b> was <b>${status.replace('_', ' ')}</b>${u.name ? ` by ${u.name}` : ''}.</p>${note ? mailPanel(`<b>Message:</b> ${String(note)}`) : ''}${status === 'approved' ? mailButton(`${APP_URL}/procurement`, 'Proceed to order') : ''}`, `Your request was ${status.replace('_', ' ')}`),
        text: `Your purchase request "${req.title}" was ${status}.${note ? ` Message: ${String(note)}` : ''}` })
    }
  } catch { /* email is best-effort */ }
  return c.json(p)
})

procurement.put('/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const ex = await prisma.procurementRequest.findUnique({ where: { id }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  try {
    await prisma.procurementItem.deleteMany({ where: { procurementId: id } })
    const p = await prisma.procurementRequest.update({
      where: { id },
      data: {
        budgetType: ['CAPEX', 'OPEX'].includes(b.budgetType) ? b.budgetType : 'OPEX', budgetYear: b.budgetYear != null && b.budgetYear !== '' ? Number(b.budgetYear) : null, approverEmail: b.approverEmail || null, approverName: b.approverName || null, external: !!b.external, vatPercent: b.vatPercent != null && b.vatPercent !== '' ? Number(b.vatPercent) : null, vendorQuotes: b.vendorQuotes !== undefined ? (Array.isArray(b.vendorQuotes) ? JSON.stringify(b.vendorQuotes) : (b.vendorQuotes ?? null)) : undefined, kind: b.kind || 'QUOTE', title: b.title, description: b.description ?? '', supplier: b.supplier ?? null,
        campus: b.campus || null, department: b.department || null, lab: b.lab || null,
        quotedAmount: b.quotedAmount != null && b.quotedAmount !== '' ? Number(b.quotedAmount) : null,
        currency: b.currency ?? 'AED', invoiceUrl: b.invoiceUrl ?? null, quotationUrl: b.quotationUrl ?? null,
        documents: b.documents !== undefined ? (Array.isArray(b.documents) ? JSON.stringify(b.documents) : (b.documents ?? null)) : undefined,
        status: b.status ?? 'draft', vendorId: b.vendorId || null,
        items: { create: await mapOwnedItems(prisma, b, u.tenant) },
      },
      include: INC,
    })
    return c.json(p)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// Delete a procurement request (lab team).
procurement.delete('/:id', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const ex = await prisma.procurementRequest.findUnique({ where: { id }, select: { tenantId: true } })
  if (!ex || ex.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  try {
    await prisma.procurementItem.deleteMany({ where: { procurementId: id } })
    await prisma.procurementRequest.delete({ where: { id } })
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// Save deliverables (received items + invoice unit costs + invoice/delivery-note files) without
// touching the item rows. Stored as order-level JSON aligned to the items array.
procurement.post('/:id/deliverables', requireRole(...ALL_LAB), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const p = await prisma.procurementRequest.findUnique({ where: { id } })
  if (!p || p.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (b.invoiceUrl !== undefined) data.invoiceUrl = b.invoiceUrl || null
  if (b.deliveryNoteUrl !== undefined) data.deliveryNoteUrl = b.deliveryNoteUrl || null
  if (b.deliverables !== undefined) data.deliverables = Array.isArray(b.deliverables) ? JSON.stringify(b.deliverables) : (b.deliverables ?? null)
  const updated = await prisma.procurementRequest.update({ where: { id }, data, include: INC })
  return c.json(updated)
})

// Push received deliverables into inventory: increment stock for known items (weighted-average price
// when the invoice unit cost differs), create new items for ones not in inventory yet.
procurement.post('/:id/receive-stock', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const p = await prisma.procurementRequest.findUnique({ where: { id } })
  if (!p || p.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const lines: { itemId?: string; customName?: string; category?: string; type?: string; unit?: string; quantity?: number; unitCost?: number | string }[] = Array.isArray(body.lines) ? body.lines : []
  const typeFor = (cat?: string) => { const x = (cat || '').toLowerCase(); if (x.includes('tool')) return 'TOOL'; if (x.includes('equip')) return 'EQUIPMENT'; if (x.includes('ppe')) return 'PPE'; return 'CONSUMABLE' }
  // Stock is kept in base PIECES, so convert ordered Box/Dozen to pieces (and unit cost to per-piece) on receipt.
  const piecesPer = (unit?: string, unitsPerBox?: number | null) => { const u = String(unit || '').toUpperCase(); if (u === 'DOZEN') return 12; if (u === 'BOX') return Math.max(1, Math.round(Number(unitsPerBox) || 0) || 1); return 1 }
  let updated = 0, created = 0
  const averaged: { name: string; oldPrice: number; newPrice: number }[] = []
  // Same vendor for the whole order — look it up ONCE instead of per custom line.
  const vendorName = p.vendorId ? (await prisma.vendor.findUnique({ where: { id: p.vendorId } }))?.name ?? null : (p.supplier || null)
  for (const ln of lines) {
    const rawQty = Math.max(0, Math.round(Number(ln.quantity) || 0))
    if (rawQty <= 0) continue
    const unitCost = ln.unitCost != null && ln.unitCost !== '' ? Number(ln.unitCost) : null // per the ordered unit
    try {
      if (ln.itemId) {
        const it = await prisma.inventoryItem.findUnique({ where: { id: ln.itemId } })
        if (!it || it.tenantId !== u.tenant) continue
        const per = piecesPer(ln.unit, it.unitsPerBox)
        const qty = rawQty * per                                    // base pieces added
        const perPieceCost = unitCost != null ? unitCost / per : null // per-piece cost
        const oldQty = it.quantity || 0
        const oldPrice = it.pricePerPiece
        let newPrice = oldPrice
        if (perPieceCost != null) {
          newPrice = (oldPrice == null || oldQty <= 0) ? perPieceCost : Math.round(((oldQty * oldPrice + qty * perPieceCost) / (oldQty + qty)) * 100) / 100
          if (oldPrice != null && newPrice !== oldPrice) averaged.push({ name: it.name, oldPrice, newPrice })
        }
        await prisma.inventoryItem.update({ where: { id: it.id }, data: { quantity: oldQty + qty, ...(newPrice != null ? { pricePerPiece: newPrice } : {}), ...(p.vendorId && !it.supplierId ? { supplierId: p.vendorId } : {}) } })
        await prisma.stockMovement.create({ data: { tenantId: u.tenant, itemId: it.id, delta: qty, reason: 'received', refType: 'procurement', refId: id, unitCost: perPieceCost, note: `Received: ${p.title} (${rawQty} ${ln.unit || 'PIECE'})`, createdById: u.sub } })
        updated++
      } else if (ln.customName) {
        const per = piecesPer(ln.unit, null) // new item: Dozen→12, Box unknown→1
        const qty = rawQty * per
        const perPieceCost = unitCost != null ? unitCost / per : null
        const made = await prisma.inventoryItem.create({ data: { tenantId: u.tenant, name: ln.customName, type: typeFor(ln.category), category: ln.category || 'Procured', quantity: qty, unit: 'PIECE', pricePerPiece: perPieceCost, priceCurrency: 'AED', ...(p.vendorId ? { supplierId: p.vendorId } : {}), notes: `Added from procurement: ${p.title}${vendorName ? ` — vendor: ${vendorName}` : ''}` } })
        await prisma.stockMovement.create({ data: { tenantId: u.tenant, itemId: made.id, delta: qty, reason: 'received', refType: 'procurement', refId: id, unitCost: perPieceCost, note: `Received (new): ${p.title} (${rawQty} ${ln.unit || 'PIECE'})`, createdById: u.sub } })
        created++
      }
    } catch { /* skip a bad line */ }
  }
  return c.json({ ok: true, updated, created, averaged })
})

// Mark delivered + add items to inventory: increment stock for known items, create new ones for custom items.
procurement.post('/:id/receive', requireRole(...LAB_TEAM), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const id = c.req.param('id')
  const p = await prisma.procurementRequest.findUnique({ where: { id }, include: { items: true } })
  if (!p || p.tenantId !== u.tenant) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const ids: string[] | undefined = Array.isArray(body.ids) ? body.ids : undefined
  const chosen = ids ? p.items.filter((it) => ids.includes(it.id)) : p.items
  let updated = 0, created = 0
  for (const it of chosen) {
    const qty = Math.max(0, Math.round(it.quantity || 0))
    if (it.itemId) {
      // Defence in depth: only ever touch stock of an item in the caller's tenant (mirrors
      // /receive-stock). mapOwnedItems already blocks foreign itemIds at write time. #tenant-isolation
      const inv = await prisma.inventoryItem.findUnique({ where: { id: it.itemId }, select: { tenantId: true } })
      if (!inv || inv.tenantId !== u.tenant) continue
      await prisma.inventoryItem.update({ where: { id: it.itemId }, data: { quantity: { increment: qty } } })
      updated++
    } else if (it.customName) {
      await prisma.inventoryItem.create({
        data: { tenantId: u.tenant, name: it.customName, type: 'CONSUMABLE', category: 'Procured', quantity: qty, unit: it.unit || null, pricePerPiece: it.estPrice ?? null, pictureUrl: it.imageUrl ?? null, notes: `Added from procurement: ${p.title}` },
      })
      created++
    }
  }
  await prisma.procurementRequest.update({ where: { id }, data: { status: 'delivered' } })
  return c.json({ ok: true, updated, created })
})

export default procurement
