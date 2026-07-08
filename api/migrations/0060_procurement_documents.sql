-- Multiple attachments (quotes & supporting docs) on a purchase request.
ALTER TABLE "ProcurementRequest" ADD COLUMN "documents" TEXT;
