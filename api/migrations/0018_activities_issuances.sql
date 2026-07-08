-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PROJECT',
    "title" TEXT NOT NULL,
    "supervisor" TEXT,
    "supervisorEmail" TEXT,
    "researcher" TEXT,
    "courseCode" TEXT,
    "labId" TEXT,
    "facilities" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "itemId" TEXT,
    "customName" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT DEFAULT 'PIECE',
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "price" REAL,
    CONSTRAINT "ActivityItem_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Issuance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "activityId" TEXT,
    "studentName" TEXT,
    "groupName" TEXT,
    "facultyName" TEXT,
    "courseCode" TEXT,
    "studentEmail" TEXT,
    "facultyEmail" TEXT,
    "supervisorEmail" TEXT,
    "borrowDate" TEXT,
    "returnDate" TEXT,
    "status" TEXT DEFAULT 'ISSUED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Issuance_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IssuanceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issuanceId" TEXT NOT NULL,
    "itemId" TEXT,
    "customName" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT DEFAULT 'PIECE',
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "price" REAL,
    CONSTRAINT "IssuanceItem_issuanceId_fkey" FOREIGN KEY ("issuanceId") REFERENCES "Issuance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IssuanceItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
