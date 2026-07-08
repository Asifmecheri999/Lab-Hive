-- Track whether an issuance's items were deducted from inventory stock
ALTER TABLE "Issuance" ADD COLUMN "stockDeducted" BOOLEAN NOT NULL DEFAULT 0;
