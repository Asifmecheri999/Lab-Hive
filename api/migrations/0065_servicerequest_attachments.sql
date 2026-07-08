-- Multiple file attachments (drawings/specs) on a student job request.
ALTER TABLE "ServiceRequest" ADD COLUMN "attachments" TEXT;
