-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "calibrationCertificateUrl" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "calibrationFrequency" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "calibrationType" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "lastMaintenanceDate" DATETIME;
ALTER TABLE "InventoryItem" ADD COLUMN "maintenanceCertificateUrl" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "nextMaintenanceDue" DATETIME;
