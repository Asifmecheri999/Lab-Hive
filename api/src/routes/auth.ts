// Auth routes — login + current user.
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { verifyPassword, hashPassword, signToken } from '../lib/auth'
import { requireAuth, type AuthVars } from '../middleware/auth'
import { sendEmail, mailLayout, mailCode } from '../lib/email'

const auth = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// Current privacy-policy version. Bump this string when the policy materially changes
// and every user will be asked to agree again on their next sign-in.
const POLICY_VERSION = '2026-07-02'

// Password policy: 8+ chars with a capital, a small letter and a special character.
function passwordIssue(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(pw)) return 'Include at least one capital letter'
  if (!/[a-z]/.test(pw)) return 'Include at least one small letter'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Include at least one special character'
  return null
}

// POST /api/auth/login  { email, password } -> { token, user }
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}))
  if (!email || !password) {
    return c.json({ error: 'email and password are required' }, 400)
  }

  const prisma = getPrisma(c.env.DB)
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } })
  if (!user || !user.passwordHash) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return c.json({ error: 'Invalid credentials' }, 401)

  const tenant = user.tenantId ? await prisma.tenant.findUnique({ where: { id: user.tenantId } }) : null
  if (tenant && !user.superAdmin && (tenant.status === 'suspended' || tenant.status === 'expired')) {
    return c.json({ error: `Your LabSynch workspace is ${tenant.status}. Contact info@labsynch.com to reactivate.` }, 403)
  }
  const token = await signToken(
    { sub: user.id, email: user.email, name: user.name, role: user.role, tenant: user.tenantId ?? undefined, plan: tenant?.plan, superAdmin: user.superAdmin },
    c.env.AUTH_SECRET,
  )
  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, tenant: user.tenantId, plan: tenant?.plan, superAdmin: user.superAdmin, mustResetPassword: user.mustResetPassword },
  })
})

// POST /api/auth/change-password { password } — authenticated; sets a new password + clears the force-reset flag.
auth.post('/change-password', requireAuth, async (c) => {
  const u = c.get('user')
  const { password } = await c.req.json().catch(() => ({}))
  const issue = passwordIssue(String(password ?? '')); if (issue) return c.json({ error: issue }, 400)
  const prisma = getPrisma(c.env.DB)
  const current = await prisma.user.findUnique({ where: { id: u.sub } })
  if (current?.passwordHash && await verifyPassword(String(password), current.passwordHash)) return c.json({ error: 'New password must be different from your current one' }, 400)
  await prisma.user.update({ where: { id: u.sub }, data: { passwordHash: await hashPassword(String(password)), mustResetPassword: false } })
  return c.json({ ok: true })
})

// POST /api/auth/forgot { email } -> emails a 6-digit OTP (always returns ok, doesn't leak who exists)
auth.post('/forgot', async (c) => {
  const { email } = await c.req.json().catch(() => ({}))
  if (!email) return c.json({ error: 'email is required' }, 400)
  const prisma = getPrisma(c.env.DB)
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } })
  if (user) {
    const otp = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000))
    const expires = new Date(Date.now() + 2 * 60 * 1000)
    await prisma.user.update({ where: { id: user.id }, data: { resetOtp: otp, resetOtpExpires: expires } })
    await sendEmail(c.env, {
      to: user.email,
      subject: 'Your LabSynch password reset code',
      html: mailLayout('Your password reset code', `<p style="margin:0 0 4px;">Use the code below to reset your LabSynch password. It expires in <b>2 minutes</b>.</p>${mailCode(otp)}<p style="margin:0;color:#64748b;">Didn't request this? You can safely ignore this email — your password won't change.</p>`, 'Your LabSynch password reset code'),
      text: `Your LabSynch password reset code is ${otp} (expires in 2 minutes).`,
    })
  }
  return c.json({ ok: true })
})

// POST /api/auth/reset { email, otp, password } -> sets a new password
auth.post('/reset', async (c) => {
  const { email, otp, password } = await c.req.json().catch(() => ({}))
  if (!email || !otp || !password) return c.json({ error: 'email, code and new password are required' }, 400)
  const issue = passwordIssue(String(password)); if (issue) return c.json({ error: issue }, 400)
  const prisma = getPrisma(c.env.DB)
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } })
  if (!user || !user.resetOtp || !user.resetOtpExpires || user.resetOtp !== String(otp).trim() || new Date(user.resetOtpExpires).getTime() < Date.now()) {
    return c.json({ error: 'Invalid or expired code' }, 400)
  }
  if (user.passwordHash && await verifyPassword(String(password), user.passwordHash)) return c.json({ error: 'New password must be different from your current one' }, 400)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(String(password)), resetOtp: null, resetOtpExpires: null } })
  await sendEmail(c.env, {
    to: user.email,
    subject: 'Your LabSynch password was changed',
    html: mailLayout('Password changed', `<p>Hi ${user.name}, your LabSynch password was just changed successfully.</p><p style="color:#64748b">If this wasn't you, reset it again immediately or contact us at info@labsynch.com.</p>`),
    text: `Your LabSynch password was changed successfully. If this wasn't you, reset it again or contact info@labsynch.com.`,
  })
  return c.json({ ok: true })
})

// GET /api/auth/me -> current user (with fresh approver flag + policy-consent status)
auth.get('/me', requireAuth, async (c) => {
  const u = c.get('user')
  const prisma = getPrisma(c.env.DB)
  const me = await prisma.user.findUnique({ where: { id: u.sub }, select: { isApprover: true, acceptedPolicyAt: true, acceptedPolicyVersion: true } })
  return c.json({
    id: u.sub, email: u.email, name: u.name, role: u.role,
    isApprover: !!me?.isApprover,
    policyVersion: POLICY_VERSION,
    acceptedPolicyVersion: me?.acceptedPolicyVersion ?? null,
    acceptedPolicyAt: me?.acceptedPolicyAt ?? null,
  })
})

// POST /api/auth/accept-policy -> record that this user agreed to the current policy version.
auth.post('/accept-policy', requireAuth, async (c) => {
  const u = c.get('user')
  const prisma = getPrisma(c.env.DB)
  await prisma.user.update({ where: { id: u.sub }, data: { acceptedPolicyAt: new Date(), acceptedPolicyVersion: POLICY_VERSION } })
  return c.json({ ok: true, acceptedPolicyVersion: POLICY_VERSION })
})

export default auth
