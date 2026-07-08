-- Maintenance log v2: status workflow, in-house/outsource mode, multiple documents
ALTER TABLE "MaintenanceLog" ADD COLUMN "status" TEXT;
ALTER TABLE "MaintenanceLog" ADD COLUMN "mode" TEXT;
ALTER TABLE "MaintenanceLog" ADD COLUMN "documents" TEXT;
