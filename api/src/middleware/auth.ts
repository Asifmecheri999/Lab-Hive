// Auth middleware — verifies the Bearer JWT and enforces roles.
import type { Context, Next } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { verifyToken, type AuthClaims } from '../lib/auth'
import { withTimeout } from '../lib/net'

// Hono variable typing so handlers can read c.get('user')
export type AuthVars = { user: AuthClaims }

// Plan limits per tier (null = unlimited). Free is a single department with entry caps;
// upgrading widens the hierarchy and lifts caps.
type LimitKey = 'campuses' | 'schools' | 'departments' | 'labs' | 'inventory' | 'users' | 'experiments'
type Limits = Record<LimitKey, number | null>
export const PLAN_LIMITS: Record<string, Limits> = {
  FREE:        { campuses: 1, schools: 1, departments: 1,    labs: 1,    inventory: 25,   users: 5,   experiments: 3 },
  SCHOOL:      { campuses: 1, schools: 1, departments: null, labs: 25,   inventory: 5000, users: 200, experiments: 200 },
  ENTERPRISE:  { campuses: 1, schools: null, departments: null, labs: null, inventory: null, users: null, experiments: null },
  MULTICAMPUS: { campuses: null, schools: null, departments: null, labs: null, inventory: null, users: null, experiments: null },
  // legacy aliases
  DEMO:        { campuses: 1, schools: 1, departments: 1,    labs: 1,    inventory: 25,   users: 5,   experiments: 3 },
  DEPARTMENT:  { campuses: 1, schools: 1, departments: null, labs: 25,   inventory: 5000, users: 200, experiments: 200 },
}
export function planLimit(plan: string | undefined, kind: LimitKey, status?: string): number | null {
  // Fully-free build — nothing is capped, for anyone, on any plan. PLAN_LIMITS above is kept only
  // as a reference: to re-enable tiered limits, restore
  //   `return (status === 'trial' ? null : (PLAN_LIMITS[plan ?? 'FREE'] ?? PLAN_LIMITS.FREE)[kind])`.
  void plan; void kind; void status;
  return null
}

// A workspace whose trial has lapsed (expired) or been suspended is paused — no access until
// reactivated. The platform owner (super admin) is exempt so they can manage reactivation.
// New sign-ins are blocked in routes/auth.ts; this gates existing sessions mid-flight too.
const PAUSED_STATUSES = ['expired', 'suspended']
export function isPaused(claims: AuthClaims): boolean {
  return !claims.superAdmin && !!claims.status && PAUSED_STATUSES.includes(claims.status)
}
const PAUSED_BODY = {
  error: 'trial_expired',
  message: 'Your LabSynch trial has ended. Contact info@labsynch.com to reactivate your workspace.',
}

// Role groups per the documented role rules. ADMIN has full access, so it is included
// in the lab-team write group as well.
export const LAB_TEAM = ['LAB_TECHNICIAN', 'LAB_COORDINATOR', 'LAB_MANAGER', 'ADMIN']
export const APPROVERS = ['LAB_MANAGER', 'HEAD_OF_SCHOOL', 'DEAN', 'ADMIN']
export const ALL_STAFF = [...LAB_TEAM, 'FACULTY', 'HEAD_OF_SCHOOL', 'DEAN']

async function readClaims(c: Context<{ Bindings: Env; Variables: AuthVars }>): Promise<AuthClaims | null> {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  const claims = await verifyToken(header.slice(7), c.env.AUTH_SECRET)
  if (!claims) return null
  // Re-check the user (and their tenant) against the DB so role changes, account removal,
  // plan upgrades and trial expiry all take effect immediately — not only when the 30-day token
  // expires. On a DB hiccup we fall back to the token so we don't lock everyone out.
  // These two lookups run on EVERY authenticated request. Bound them with a timeout so a
  // slow/contended D1 can't hang every endpoint — on timeout we throw, get caught below,
  // and fall back to the (valid, signed) token claims instead of freezing the request.
  try {
    const prisma = getPrisma(c.env.DB)
    const fresh = await withTimeout(
      prisma.user.findUnique({ where: { id: claims.sub }, select: { role: true, name: true, email: true, tenantId: true } }),
      4000, 'auth user lookup',
    )
    if (!fresh) return null // user deleted/deactivated → token no longer valid
    let plan = claims.plan
    let status = claims.status
    if (fresh.tenantId) {
      const t = await withTimeout(
        prisma.tenant.findUnique({ where: { id: fresh.tenantId }, select: { plan: true, status: true } }),
        4000, 'auth tenant lookup',
      )
      if (t) { plan = t.plan ?? plan; status = t.status }
    }
    return { ...claims, role: fresh.role, name: fresh.name ?? claims.name, email: fresh.email ?? claims.email, tenant: fresh.tenantId ?? claims.tenant, plan, status }
  } catch {
    return claims
  }
}

// Require a valid logged-in user.
export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: AuthVars }>,
  next: Next,
) {
  const claims = await readClaims(c)
  if (!claims) return c.json({ error: 'Unauthorized' }, 401)
  if (isPaused(claims)) return c.json(PAUSED_BODY, 403)
  c.set('user', claims)
  await next()
}

// Require the platform owner (super admin) — manages all organisations/tenants.
export async function requireSuperAdmin(
  c: Context<{ Bindings: Env; Variables: AuthVars }>,
  next: Next,
) {
  const claims = await readClaims(c)
  if (!claims) return c.json({ error: 'Unauthorized' }, 401)
  if (!claims.superAdmin) return c.json({ error: 'Forbidden — platform owner only' }, 403)
  c.set('user', claims)
  await next()
}

// Require the logged-in user to hold one of the given roles.
export function requireRole(...roles: string[]) {
  return async (c: Context<{ Bindings: Env; Variables: AuthVars }>, next: Next) => {
    const claims = await readClaims(c)
    if (!claims) return c.json({ error: 'Unauthorized' }, 401)
    if (isPaused(claims)) return c.json(PAUSED_BODY, 403)
    if (!roles.includes(claims.role)) {
      return c.json({ error: 'Forbidden', requiredRoles: roles }, 403)
    }
    c.set('user', claims)
    await next()
  }
}
