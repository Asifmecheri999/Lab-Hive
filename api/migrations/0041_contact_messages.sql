-- Public contact / access-request submissions from the landing page.
CREATE TABLE "ContactMessage" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "organisation" TEXT,
  "plan" TEXT,
  "message" TEXT NOT NULL,
  "handled" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
