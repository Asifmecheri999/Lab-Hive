-- Maintenance logs get a due date (separate from the next-due date).
ALTER TABLE "MaintenanceLog" ADD COLUMN "dueDate" DATETIME;
