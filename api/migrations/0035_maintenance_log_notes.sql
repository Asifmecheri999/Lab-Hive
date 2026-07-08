-- Maintenance logs get a free-text notes field (e.g. repair done / changes made).
ALTER TABLE "MaintenanceLog" ADD COLUMN "notes" TEXT;
