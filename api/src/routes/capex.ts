// CAPEX / OPEX planning — budget summary view over procurement requests.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireRole, LAB_TEAM, type AuthVars } from '../middleware/auth'

const ALL_LAB = [...LAB_TEAM, 'HEAD_OF_SCHOOL', 'DEAN', 'ADMIN']
const capex = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// Aggregate spend by budget type and status (committed vs delivered).
capex.get('/summary', requireRole(...ALL_LAB), async (c) => {
  const prisma = getPrisma(c.env.DB)
  const u = c.get('user')
  const all = await prisma.procurementRequest.findMany({ where: { tenantId: u.tenant } })

  const sum = (rows: typeof all) => rows.reduce((t, r) => t + (r.quotedAmount ?? 0), 0)
  const byType = (type: string) => {
    const rows = all.filter((r) => r.budgetType === type)
    return {
      total: sum(rows),
      committed: sum(rows.filter((r) => ['approved', 'ordered', 'sent_to_erp'].includes(r.status))),
      delivered: sum(rows.filter((r) => r.status === 'delivered')),
      pending: sum(rows.filter((r) => ['draft', 'submitted'].includes(r.status))),
      count: rows.length,
    }
  }

  return c.json({ currency: 'AED', CAPEX: byType('CAPEX'), OPEX: byType('OPEX') })
})

export default capex
