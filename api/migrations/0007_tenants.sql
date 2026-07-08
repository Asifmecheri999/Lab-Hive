-- AlterTable
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Lab" ADD COLUMN "tenantId" TEXT;

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'DEMO',
    "department" TEXT,
    "maxLabs" INTEGER,
    "maxInventory" INTEGER,
    "maxUsers" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
