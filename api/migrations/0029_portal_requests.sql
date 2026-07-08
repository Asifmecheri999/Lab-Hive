-- Flexible store for user-submitted portal requests (resource/borrowing, lab access, etc.)
CREATE TABLE "PortalRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT,
  "userId" TEXT NOT NULL,
  "submitterName" TEXT,
  "submitterEmail" TEXT,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "data" TEXT,
  "items" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
