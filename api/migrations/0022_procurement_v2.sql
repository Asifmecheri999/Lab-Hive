-- Procurement v2: request kind (quote/budget) + location; per-item image
ALTER TABLE "ProcurementRequest" ADD COLUMN "kind" TEXT;
ALTER TABLE "ProcurementRequest" ADD COLUMN "campus" TEXT;
ALTER TABLE "ProcurementRequest" ADD COLUMN "department" TEXT;
ALTER TABLE "ProcurementRequest" ADD COLUMN "lab" TEXT;
ALTER TABLE "ProcurementItem" ADD COLUMN "imageUrl" TEXT;
