-- AlterTable
ALTER TABLE "Experiment" ADD COLUMN "equipmentManualUrl" TEXT;
ALTER TABLE "Experiment" ADD COLUMN "experimentManualUrl" TEXT;
ALTER TABLE "Experiment" ADD COLUMN "riskAssessmentUrl" TEXT;
ALTER TABLE "Experiment" ADD COLUMN "safetyOperatingProcedureUrl" TEXT;
ALTER TABLE "Experiment" ADD COLUMN "standardOperatingProcedureUrl" TEXT;

-- CreateTable
CREATE TABLE "Faculty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "department" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
