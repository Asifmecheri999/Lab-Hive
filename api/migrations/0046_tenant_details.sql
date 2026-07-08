-- Richer organisation details for the platform owner: notes, attachments, payment log.
ALTER TABLE "Tenant" ADD COLUMN "notes" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "attachments" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "payments" TEXT;
