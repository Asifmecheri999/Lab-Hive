-- Admin-managed PPE item list students can request (JSON array of names).
ALTER TABLE "Tenant" ADD COLUMN "ppeOptions" TEXT;
