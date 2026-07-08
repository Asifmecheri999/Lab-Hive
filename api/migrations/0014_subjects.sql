-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "facultyName" TEXT,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Experiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "subjectId" TEXT,
    "labId" TEXT,
    "title" TEXT NOT NULL,
    "courseCode" TEXT,
    "facultyName" TEXT,
    "groups" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Experiment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Experiment_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Experiment" ("courseCode", "createdAt", "facultyName", "groups", "id", "labId", "notes", "tenantId", "title", "updatedAt") SELECT "courseCode", "createdAt", "facultyName", "groups", "id", "labId", "notes", "tenantId", "title", "updatedAt" FROM "Experiment";
DROP TABLE "Experiment";
ALTER TABLE "new_Experiment" RENAME TO "Experiment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
