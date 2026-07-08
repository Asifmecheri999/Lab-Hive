// Central stock engine. Every quantity change goes through here so it (a) never takes stock below 0,
// (b) writes an append-only StockMovement ledger row, and (c) posts OPEX for real consumption.
import type { getPrisma } from './db'

type Db = ReturnType<typeof getPrisma>

export function opexCategory(type?: string | null): string {
  const t = (type || '').toUpperCase()
  return t === 'CONSUMABLE' || t === 'PPE' ? 'consumables' : 'other'
}

// Apply a stock delta (+in / -out), clamped so quantity never goes negative, and log it. Returns the applied delta.
export async function moveStock(prisma: Db, p: {
  tenantId?: string | null; itemId: string; delta: number; reason: string;
  refType?: string | null; refId?: string | null; unitCost?: number | null; note?: string | null; date?: Date; userId?: string | null;
}): Promise<number> {
  const item = await prisma.inventoryItem.findUnique({ where: { id: p.itemId }, select: { quantity: true, tenantId: true } })
  if (!item) return 0
  if (p.tenantId != null && item.tenantId !== p.tenantId) return 0 // never move another tenant's stock
  const applied = p.delta < 0 ? -Math.min(item.quantity || 0, -p.delta) : p.delta
  if (applied === 0) return 0
  await prisma.inventoryItem.update({ where: { id: p.itemId }, data: { quantity: (item.quantity || 0) + applied } })
  await prisma.stockMovement.create({ data: {
    tenantId: p.tenantId ?? null, itemId: p.itemId, delta: applied, reason: p.reason,
    refType: p.refType ?? null, refId: p.refId ?? null, unitCost: p.unitCost ?? null,
    note: p.note ?? null, date: p.date ?? new Date(), createdById: p.userId ?? null,
  } })
  return applied
}

// Change the CONSUMED amount of an item by `deltaConsumed` (>0 use more, <0 give back): moves stock the
// opposite way and posts a matching OPEX expense (negative for refunds) at the item's average cost.
export async function adjustConsumption(prisma: Db, p: {
  tenantId?: string | null; itemId: string; deltaConsumed: number; reason: string;
  refType?: string | null; refId?: string | null; description: string; date?: Date; userId?: string | null; userName?: string | null;
}): Promise<{ used: number; amount: number }> {
  if (!p.deltaConsumed) return { used: 0, amount: 0 }
  const item = await prisma.inventoryItem.findUnique({ where: { id: p.itemId }, select: { quantity: true, pricePerPiece: true, name: true, type: true } })
  if (!item) return { used: 0, amount: 0 }
  const unitCost = item.pricePerPiece ?? 0
  const applied = await moveStock(prisma, {
    tenantId: p.tenantId, itemId: p.itemId, delta: -p.deltaConsumed, reason: p.reason,
    refType: p.refType, refId: p.refId, unitCost, note: p.description, date: p.date, userId: p.userId,
  })
  const used = -applied // positive = consumed, negative = refunded
  const amount = used * unitCost
  if (used !== 0) {
    await prisma.opexExpense.create({ data: {
      tenantId: p.tenantId ?? null, amount, category: opexCategory(item.type),
      description: p.description, date: p.date ?? new Date(), source: p.refType === 'experiment' ? 'experiment' : 'use',
      createdById: p.userId ?? null, createdByName: p.userName ?? null,
    } })
  }
  return { used, amount }
}
