// Prisma client wired to Cloudflare D1 via the @labhive/db package.
// Each Worker request gets a client bound to that request's D1 binding (env.DB).
import { getPrisma } from '@labhive/db'

export interface Env {
  DB: D1Database
  FILES?: R2Bucket
  ENVIRONMENT: string
  AUTH_SECRET: string
  ANTHROPIC_API_KEY?: string
  // Email sending (use whichever you set): ZeptoMail (Zoho) or Resend.
  ZEPTO_TOKEN?: string
  RESEND_API_KEY?: string
  MAIL_FROM?: string // defaults to info@labsynch.com
  MAIL_TO?: string   // where contact-form notifications go; defaults to MAIL_FROM
  // Web Push (phone notifications) — VAPID keys.
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
}

export { getPrisma }
