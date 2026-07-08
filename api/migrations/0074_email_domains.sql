-- Admin-set allowlist of email domains for new users (comma-separated; empty = any).
ALTER TABLE "Tenant" ADD COLUMN "allowedEmailDomains" TEXT;
