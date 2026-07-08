-- Per-user "delete" = hide. Removing a request only hides it from the person who deleted it;
-- the other side (requester ⟷ lab team) keeps seeing it. refType: JOB | PORTAL | RA.
CREATE TABLE "RequestHide" (
  "id"        TEXT PRIMARY KEY NOT NULL,
  "tenantId"  TEXT,
  "userId"    TEXT NOT NULL,
  "refType"   TEXT NOT NULL,
  "refId"     TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RequestHide_userId_refType_refId_key" ON "RequestHide" ("userId", "refType", "refId");
