-- AlterTable
ALTER TABLE "Lab" ADD COLUMN "color" TEXT;
ALTER TABLE "Lab" ADD COLUMN "labDocuments" TEXT;
ALTER TABLE "Lab" ADD COLUMN "pictureUrl" TEXT;

-- CreateTable
CREATE TABLE "ExperimentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "experimentId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "groupName" TEXT,
    CONSTRAINT "ExperimentSession_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
