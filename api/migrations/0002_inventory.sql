-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT,
    "labId" TEXT,
    "location" TEXT,
    "subLocation" TEXT,
    "ownership" TEXT,
    "serialNumber" TEXT,
    "barcode" TEXT,
    "pictureUrl" TEXT,
    "barcodeUrl" TEXT,
    "electricalReq" TEXT,
    "additionalMep" TEXT,
    "patRequired" BOOLEAN NOT NULL DEFAULT false,
    "patExpiration" DATETIME,
    "maintenanceRequired" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceType" TEXT,
    "maintenanceFrequency" TEXT,
    "calibrationRequired" BOOLEAN NOT NULL DEFAULT false,
    "calibrationDate" DATETIME,
    "calibrationExpiry" DATETIME,
    "serviceProviderId" TEXT,
    "riskAssessmentUrl" TEXT,
    "experimentManualUrl" TEXT,
    "safetyOperatingProcedureUrl" TEXT,
    "standardOperatingProcedureUrl" TEXT,
    "maintenanceLogUrl" TEXT,
    "equipmentManualUrl" TEXT,
    "comments" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventoryItem" ("category", "createdAt", "id", "labId", "location", "minQuantity", "name", "notes", "quantity", "serialNumber", "type", "unit", "updatedAt") SELECT "category", "createdAt", "id", "labId", "location", "minQuantity", "name", "notes", "quantity", "serialNumber", "type", "unit", "updatedAt" FROM "InventoryItem";
DROP TABLE "InventoryItem";
ALTER TABLE "new_InventoryItem" RENAME TO "InventoryItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
