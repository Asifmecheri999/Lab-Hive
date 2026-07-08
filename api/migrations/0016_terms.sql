-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "startDate" TEXT,
    "weeks" INTEGER NOT NULL DEFAULT 12,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimetableEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "termId" TEXT,
    "labId" TEXT,
    "experimentId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'EXPERIMENT',
    "title" TEXT,
    "facultyName" TEXT,
    "groups" INTEGER,
    "week" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimetableEntry_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetableEntry_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimetableEntry_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TimetableEntry" ("createdAt", "dayOfWeek", "endTime", "experimentId", "facultyName", "groups", "id", "kind", "labId", "notes", "startTime", "tenantId", "title", "week") SELECT "createdAt", "dayOfWeek", "endTime", "experimentId", "facultyName", "groups", "id", "kind", "labId", "notes", "startTime", "tenantId", "title", "week" FROM "TimetableEntry";
DROP TABLE "TimetableEntry";
ALTER TABLE "new_TimetableEntry" RENAME TO "TimetableEntry";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
