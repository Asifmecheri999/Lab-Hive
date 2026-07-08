-- Append-only stock ledger + issuance return flag.
CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT,
  "itemId" TEXT NOT NULL,
  "delta" REAL NOT NULL,
  "reason" TEXT NOT NULL,
  "refType" TEXT,
  "refId" TEXT,
  "unitCost" REAL,
  "note" TEXT,
  "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "StockMovement_tenantId_idx" ON "StockMovement"("tenantId");
CREATE INDEX "StockMovement_itemId_idx" ON "StockMovement"("itemId");

ALTER TABLE "Issuance" ADD COLUMN "stockReturned" BOOLEAN NOT NULL DEFAULT false;
