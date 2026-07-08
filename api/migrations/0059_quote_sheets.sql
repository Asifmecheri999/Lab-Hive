-- Quote collection: compare supplier quotes (vendors x items) before raising a purchase request.
CREATE TABLE "QuoteSheet" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT,
  "title" TEXT NOT NULL,
  "data" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "QuoteSheet_tenantId_idx" ON "QuoteSheet"("tenantId");
