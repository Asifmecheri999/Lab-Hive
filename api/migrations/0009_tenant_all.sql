-- AlterTable
ALTER TABLE "LabSession" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "SafetyDocument" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "PPERequest" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "ProcurementRequest" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceLog" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceSchedule" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "tenantId" TEXT;
