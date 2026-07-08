-- Safety documents: support user RA submissions (status workflow + submitter + project)
ALTER TABLE "SafetyDocument" ADD COLUMN "status" TEXT DEFAULT 'approved';
ALTER TABLE "SafetyDocument" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "SafetyDocument" ADD COLUMN "submittedByName" TEXT;
ALTER TABLE "SafetyDocument" ADD COLUMN "project" TEXT;
