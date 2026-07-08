-- Job request: extra fields to match the standard form
ALTER TABLE "ServiceRequest" ADD COLUMN "preferredDate" DATETIME;
ALTER TABLE "ServiceRequest" ADD COLUMN "urgentReason" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN "studentId" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN "course" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN "supervisor" TEXT;
