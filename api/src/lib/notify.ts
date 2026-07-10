// Server-persisted notifications for the bell + sidebar. Each call writes a Notification row
// (the reliable source of truth) AND sends a best-effort web-push to the recipient's devices.
// Callers should wrap these in `c.executionCtx?.waitUntil(...)` so the user's action returns
// immediately and a notification failure can never break the triggering request.
import type { Env } from './db'
import { getPrisma } from './db'
import { notifyUser } from './webpush'

export type NotifyPayload = {
  type: string    // JOB | RA | PPE | RESOURCE | ACCESS | COMMENT | PROCUREMENT
  event: string   // SUBMITTED | APPROVED | REJECTED | HOLD | IN_PROGRESS | COMPLETED | ISSUED | MESSAGE
  title: string
  body?: string
  refType?: string // JOB | RA | PPE | RESOURCE | ACCESS (deep-link / sidebar tab)
  refId?: string
  url?: string
}

// Persist a notification for one recipient + push it to their devices. Never throws.
export async function notify(env: Env, userId: string | null | undefined, tenantId: string | undefined, n: NotifyPayload): Promise<void> {
  if (!userId) return
  try {
    const prisma = getPrisma(env.DB)
    await prisma.notification.create({
      data: {
        userId, tenantId: tenantId ?? null,
        type: n.type, event: n.event, title: n.title,
        body: n.body ?? null, refType: n.refType ?? null, refId: n.refId ?? null, url: n.url ?? null,
      },
    })
  } catch { /* a failed notification must never break the triggering action */ }
  try { await notifyUser(env, userId, { title: n.title, body: n.body ?? '', url: n.url }) } catch { /* push is best-effort */ }
}

// Notify several recipients (e.g. every approver / the whole lab team). Deduped; blanks skipped.
export async function notifyEach(env: Env, userIds: (string | null | undefined)[], tenantId: string | undefined, n: NotifyPayload): Promise<void> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))]
  for (const id of ids) await notify(env, id, tenantId, n)
}

// The roles that own operational request-handling — used to route "new submission" alerts.
export const LAB_TEAM_ROLES = ['LAB_TECHNICIAN', 'LAB_COORDINATOR', 'LAB_MANAGER', 'ADMIN']

// Look up the user IDs to alert when something new needs handling by the lab team.
export async function labTeamIds(env: Env, tenantId: string | undefined): Promise<string[]> {
  try {
    const prisma = getPrisma(env.DB)
    const rows = await prisma.user.findMany({
      where: { tenantId: tenantId ?? undefined, role: { in: LAB_TEAM_ROLES } },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  } catch { return [] }
}
