-- Record exactly what an issuance deducted from stock (JSON [{itemId,qty,consumed}]) so Return
-- restores the right amounts even if items were edited, and stock/OPEX never desync.
ALTER TABLE "Issuance" ADD COLUMN "deductedSnapshot" TEXT;
