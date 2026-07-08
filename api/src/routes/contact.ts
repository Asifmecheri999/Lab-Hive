// Public contact / access-request form (no payment gateway — just collects enquiries).
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { getPrisma } from '../lib/db'
import { requireSuperAdmin, type AuthVars } from '../middleware/auth'
import { sendEmail, mailLayout, mailPanel } from '../lib/email'

const contact = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// Anyone can submit (no auth). Stored in the DB and emailed to the inbox.
contact.post('/', async (c) => {
  const prisma = getPrisma(c.env.DB)
  const b = await c.req.json().catch(() => ({}))
  // Honeypot — real users never fill this hidden field; bots do. Pretend success, do nothing.
  if (b.website || b.url) return c.json({ ok: true }, 201)
  if (!b.name || !b.email || !b.message) return c.json({ error: 'name, email and message are required' }, 400)
  const name = String(b.name).slice(0, 200), email = String(b.email).slice(0, 200);
  const organisation = b.organisation ? String(b.organisation).slice(0, 200) : null;
  const plan = b.plan ? String(b.plan).slice(0, 40) : null;
  // Optional category ("complaint" for in-app issue reports) + subject line — no schema change:
  // we fold them into the stored message and the email so the inbox can triage.
  const category = b.category ? String(b.category).slice(0, 40) : null;
  const subject = b.subject ? String(b.subject).slice(0, 200) : null;
  const isComplaint = category === 'complaint';
  const rawMessage = String(b.message).slice(0, 4000);
  // Anti-spam: require a little substance, drop link-heavy spam, and de-dupe rapid repeats
  // (the same email within 2 minutes) so a double-submit or bot can't flood the inbox.
  if (rawMessage.trim().length < 5) return c.json({ error: 'Please add a little more detail.' }, 400)
  if ((rawMessage.match(/https?:\/\//gi) || []).length > 3) return c.json({ ok: true }, 201) // looks like link spam — silent drop
  const recent = await prisma.contactMessage.count({ where: { email, createdAt: { gt: new Date(Date.now() - 120000) } } })
  if (recent > 0) return c.json({ ok: true, deduped: true }, 201) // accept but don't re-send
  const message = [subject ? `Subject: ${subject}` : null, rawMessage].filter(Boolean).join('\n\n');
  await prisma.contactMessage.create({ data: { name, email, organisation, plan: category ?? plan, message } })
  // Notify the inbox (best-effort — submission is already saved if email isn't configured).
  await sendEmail(c.env, {
    to: c.env.MAIL_TO || c.env.MAIL_FROM || 'info@labsynch.com',
    subject: isComplaint
      ? `⚠️ Issue reported — ${subject || name}${organisation ? ` (${organisation})` : ''}`
      : `New access request — ${name}${organisation ? ` (${organisation})` : ''}`,
    html: mailLayout(isComplaint ? 'Issue reported from inside the app' : 'New contact / access request', `<p style="margin:0 0 4px;">${isComplaint ? 'A signed-in user reported an issue:' : "You've received a new enquiry via the LabSynch website:"}</p>${mailPanel(`<b>Name:</b> ${name}<br/><b>Email:</b> <a href="mailto:${email}" style="color:#0a8d75;text-decoration:none;">${email}</a><br/><b>Organisation:</b> ${organisation ?? '—'}<br/><b>${isComplaint ? 'Type' : 'Plan of interest'}:</b> ${isComplaint ? 'Complaint / issue' : (plan ?? '—')}`)}<p style="margin:0 0 6px;font-weight:600;color:#0A1628;">Message</p><p style="margin:0;white-space:pre-wrap;color:#334155;">${message.replace(/</g, '&lt;')}</p>`, isComplaint ? `Issue reported by ${name}` : `New enquiry from ${name}`),
    text: `${isComplaint ? 'Issue reported' : 'New request'} from ${name} <${email}> (${organisation ?? '—'}, ${isComplaint ? 'complaint' : (plan ?? '—')}):\n\n${message}`,
  })
  // Auto-acknowledgement to the person who submitted.
  await sendEmail(c.env, {
    to: email,
    subject: 'Thanks for contacting LabSynch',
    html: mailLayout('Thanks for reaching out', `<p style="margin:0 0 4px;">Hi ${name},</p><p style="margin:0 0 12px;">Thank you for contacting <b>LabSynch</b>. We&apos;ve received your message, and a member of our team will get back to you shortly at this email address.</p><p style="margin:0;color:#64748b;">— The LabSynch Team</p>`, 'We received your message'),
    text: `Hi ${name}, thanks for contacting LabSynch. We've received your request and will get back to you shortly.`,
  })
  return c.json({ ok: true }, 201)
})

// Platform owner (super admin) only — ContactMessage is platform-global (no tenantId), so a
// tenant ADMIN must NOT be able to read other orgs' enquiries/complaints. #tenant-isolation
contact.get('/', requireSuperAdmin, async (c) => {
  const prisma = getPrisma(c.env.DB)
  return c.json(await prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' } }))
})

// Platform owner (super admin) only — mark handled / delete.
contact.patch('/:id', requireSuperAdmin, async (c) => {
  const prisma = getPrisma(c.env.DB)
  const b = await c.req.json().catch(() => ({}))
  try { return c.json(await prisma.contactMessage.update({ where: { id: c.req.param('id') }, data: { handled: !!b.handled } })) }
  catch { return c.json({ error: 'Not found' }, 404) }
})

contact.delete('/:id', requireSuperAdmin, async (c) => {
  const prisma = getPrisma(c.env.DB)
  try { await prisma.contactMessage.delete({ where: { id: c.req.param('id') } }); return c.json({ ok: true }) }
  catch { return c.json({ error: 'Not found' }, 404) }
})

export default contact
