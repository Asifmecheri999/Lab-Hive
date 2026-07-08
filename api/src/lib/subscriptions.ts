// Trial reminders + auto-expire. Run daily by the cron trigger (and on-demand by the platform owner).
import type { Env } from './db'
import { getPrisma } from './db'
import { sendEmail, mailLayout } from './email'

const SUPPORT = 'info@labsynch.com'

export async function runTrialReminders(env: Env): Promise<{ reminded: number; expired: number; reactivation: number }> {
  const prisma = getPrisma(env.DB)
  const tenants = await prisma.tenant.findMany({ where: { trialEndsAt: { not: null } } })
  const now = Date.now()
  let reminded = 0, expired = 0, reactivation = 0
  for (const t of tenants) {
    if (!t.ownerEmail || !t.trialEndsAt) continue
    if (t.status === 'active' || t.status === 'suspended') continue // paid/suspended — skip
    const ends = new Date(t.trialEndsAt)
    const days = Math.ceil((ends.getTime() - now) / 86400000)
    if (days === 7 || days === 1) {
      // Before-end reminders (7 days and 1 day before).
      await sendEmail(env, {
        to: t.ownerEmail,
        subject: `Your LabSynch trial ends in ${days} day${days === 1 ? '' : 's'}`,
        html: mailLayout('Your trial is ending soon', `<p style="margin:0 0 8px;">Your LabSynch workspace <b>${t.name}</b> trial ends on <b>${ends.toDateString()}</b> — ${days} day${days === 1 ? '' : 's'} left.</p><p style="margin:0;">To keep your workspace, contact us at <a href="mailto:${SUPPORT}" style="color:#0a8d75;text-decoration:none;">${SUPPORT}</a> and we'll help you continue.</p>`, `Your LabSynch trial ends in ${days} day${days === 1 ? '' : 's'}`),
        text: `Your LabSynch trial for ${t.name} ends on ${ends.toDateString()} (${days} days left). Contact ${SUPPORT} to continue.`,
      })
      reminded++
    } else if (days <= 0 && t.status !== 'expired') {
      // Just lapsed — mark expired + notify.
      await prisma.tenant.update({ where: { id: t.id }, data: { status: 'expired' } })
      await sendEmail(env, {
        to: t.ownerEmail,
        subject: 'Your LabSynch trial has ended',
        html: mailLayout('Your trial has ended', `<p style="margin:0 0 8px;">Your LabSynch workspace <b>${t.name}</b> trial has ended, and access is now paused.</p><p style="margin:0;">To reactivate your workspace, contact us at <a href="mailto:${SUPPORT}" style="color:#0a8d75;text-decoration:none;">${SUPPORT}</a>.</p>`, 'Your LabSynch trial has ended'),
        text: `Your LabSynch trial for ${t.name} has ended. Contact ${SUPPORT} to reactivate.`,
      })
      expired++
    } else if (days === -7 && t.status === 'expired') {
      // 7 days after lapsing with no reactivation — nudge them to come back.
      await sendEmail(env, {
        to: t.ownerEmail,
        subject: 'Reactivate your LabSynch workspace',
        html: mailLayout('Still want LabSynch?', `<p style="margin:0 0 8px;">Your LabSynch workspace <b>${t.name}</b> has been paused for a week.</p><p style="margin:0;">It only takes a moment to reactivate — contact us at <a href="mailto:${SUPPORT}" style="color:#0a8d75;text-decoration:none;">${SUPPORT}</a> and we'll switch it back on.</p>`, 'Reactivate your LabSynch workspace'),
        text: `Your LabSynch workspace ${t.name} has been paused for a week. Contact ${SUPPORT} to reactivate.`,
      })
      reactivation++
    }
  }
  return { reminded, expired, reactivation }
}
