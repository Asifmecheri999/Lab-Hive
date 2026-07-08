-- Single or multi-vendor quote comparison stored on the purchase request.
ALTER TABLE "ProcurementRequest" ADD COLUMN "vendorQuotes" TEXT;
