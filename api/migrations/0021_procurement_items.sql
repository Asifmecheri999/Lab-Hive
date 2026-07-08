-- Procurement line items (a request can hold many items, from inventory or custom)
CREATE TABLE "ProcurementItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procurementId" TEXT NOT NULL,
    "itemId" TEXT,
    "customName" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT DEFAULT 'PIECE',
    "estPrice" REAL,
    "link" TEXT,
    "notes" TEXT,
    CONSTRAINT "ProcurementItem_procurementId_fkey" FOREIGN KEY ("procurementId") REFERENCES "ProcurementRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProcurementItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
