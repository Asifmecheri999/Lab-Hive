-- Activity timeline: start / end dates
ALTER TABLE "Activity" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "Activity" ADD COLUMN "endDate" DATETIME;
