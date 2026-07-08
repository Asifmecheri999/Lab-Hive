-- Two-way communication threads on any request (job, RA, portal). Re-uploaded files become history here.
CREATE TABLE "RequestComment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT,
  "refType" TEXT NOT NULL,   -- JOB | RA | PORTAL
  "refId" TEXT NOT NULL,
  "authorId" TEXT,
  "authorName" TEXT,
  "authorRole" TEXT,
  "body" TEXT,
  "fileUrl" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- School / department on job requests and RA submissions
ALTER TABLE "ServiceRequest" ADD COLUMN "school" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN "department" TEXT;
ALTER TABLE "SafetyDocument" ADD COLUMN "school" TEXT;
ALTER TABLE "SafetyDocument" ADD COLUMN "department" TEXT;
