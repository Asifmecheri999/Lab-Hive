// Email sending via an HTTP API (Workers can't do SMTP).
// Uses ZeptoMail (Zoho) if ZEPTO_TOKEN is set, else Resend if RESEND_API_KEY is set.
import type { Env } from './db'
import { fetchWithTimeout } from './net'

export async function sendEmail(env: Env, opts: { to: string; subject: string; html: string; text?: string }): Promise<boolean> {
  const from = env.MAIL_FROM || 'info@labsynch.com'
  try {
    if (env.ZEPTO_TOKEN) {
      const token = env.ZEPTO_TOKEN.startsWith('Zoho-enczapikey') ? env.ZEPTO_TOKEN : `Zoho-enczapikey ${env.ZEPTO_TOKEN}`
      const r = await fetchWithTimeout('https://api.zeptomail.com/v1.1/email', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          from: { address: from, name: 'LabSynch' },
          to: [{ email_address: { address: opts.to } }],
          subject: opts.subject,
          htmlbody: opts.html,
          ...(opts.text ? { textbody: opts.text } : {}),
        }),
      }, 12000)
      return r.ok
    }
    if (env.RESEND_API_KEY) {
      const r = await fetchWithTimeout('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `LabSynch <${from}>`, to: [opts.to], subject: opts.subject, html: opts.html, ...(opts.text ? { text: opts.text } : {}) }),
      }, 12000)
      return r.ok
    }
  } catch { /* swallow — caller decides what to do when email isn't configured */ }
  return false // no provider configured / send failed
}

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

// Professional, email-client-safe layout (table-based, inline styles). All emails flow through this.
export const mailLayout = (title: string, body: string, preheader = '') =>
  `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light only"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#eef2f6;-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(10,22,40,.10);font-family:${FONT};">
        <tr><td style="background:#0A1628;padding:20px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:.2px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00C9A7;margin-right:8px;vertical-align:middle;"></span>Lab<span style="color:#00C9A7;">Synch</span></td>
            <td align="right" style="font-size:12px;color:#94a3b8;">Lab Operations Platform</td>
          </tr></table>
        </td></tr>
        <tr><td style="height:4px;background:#00C9A7;line-height:4px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px;color:#0f172a;font-size:15px;line-height:1.65;">
          <h1 style="margin:0 0 18px;font-size:20px;font-weight:700;color:#0A1628;">${title}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e6ebf1;color:#94a3b8;font-size:12px;line-height:1.6;">
          <p style="margin:0 0 4px;">This is an automated message from <strong style="color:#64748b;">LabSynch</strong> — please don't reply to this email.</p>
          <p style="margin:0;">Need help? Contact <a href="mailto:info@labsynch.com" style="color:#0a8d75;text-decoration:none;">info@labsynch.com</a> &nbsp;·&nbsp; © LabSynch · Lab Operations Platform</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

// A rounded call-to-action button (email-safe).
export const mailButton = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>
    <td style="border-radius:8px;background:#00C9A7;">
      <a href="${href}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#04302a;text-decoration:none;border-radius:8px;font-family:${FONT};">${label}</a>
    </td></tr></table>`

// A large, easy-to-read one-time code / OTP box.
export const mailCode = (code: string) =>
  `<div style="margin:22px 0;padding:20px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:12px;text-align:center;">
    <div style="font-size:34px;font-weight:700;letter-spacing:10px;color:#0A1628;font-family:${FONT};">${code}</div>
  </div>`

// A soft info panel — good for credentials / key details.
export const mailPanel = (innerHtml: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:#f8fafc;border:1px solid #e6ebf1;border-radius:10px;"><tr>
    <td style="padding:16px 18px;font-size:14px;color:#334155;line-height:1.9;">${innerHtml}</td></tr></table>`
