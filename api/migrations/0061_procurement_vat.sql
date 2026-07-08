-- VAT % on a purchase request (line totals are excl-VAT).
ALTER TABLE "ProcurementRequest" ADD COLUMN "vatPercent" REAL;
