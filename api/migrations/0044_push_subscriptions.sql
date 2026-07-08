-- Web Push device subscriptions (phone notifications).
CREATE TABLE "PushSubscription" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL UNIQUE,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
