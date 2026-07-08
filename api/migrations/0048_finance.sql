-- Finance module: CAPEX assets, OPEX expenses, annual budget lines.
CREATE TABLE "CapexAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "cost" REAL NOT NULL,
  "purchaseDate" DATETIME NOT NULL,
  "usefulLifeYears" INTEGER NOT NULL,
  "disposed" BOOLEAN NOT NULL DEFAULT false,
  "disposedDate" DATETIME,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CapexAsset_tenantId_idx" ON "CapexAsset"("tenantId");

CREATE TABLE "OpexExpense" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT,
  "amount" REAL NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "date" DATETIME NOT NULL,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OpexExpense_tenantId_idx" ON "OpexExpense"("tenantId");

CREATE TABLE "BudgetLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT,
  "year" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL,
  "allocated" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BudgetLine_tenantId_idx" ON "BudgetLine"("tenantId");
