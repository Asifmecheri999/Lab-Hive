-- Platform owner (super admin) + force-reset flag + tenant subscription fields.
ALTER TABLE "User" ADD COLUMN "superAdmin" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "mustResetPassword" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Tenant" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE "Tenant" ADD COLUMN "trialEndsAt" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "ownerEmail" TEXT;

-- (The initial platform owner is designated per-deployment; on a fresh install set
--  "superAdmin" = 1 for your own admin account, e.g.:
--  UPDATE "User" SET "superAdmin" = 1 WHERE lower(email) = 'admin@example.edu';)
