-- Per-term working days + day start/end so the calendar reflects working week & hours.
ALTER TABLE "Term" ADD COLUMN "workDays" TEXT;
ALTER TABLE "Term" ADD COLUMN "dayStart" TEXT;
ALTER TABLE "Term" ADD COLUMN "dayEnd" TEXT;
