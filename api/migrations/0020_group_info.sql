-- Optional shared "group info" on activities & issuances (synced between linked records)
ALTER TABLE "Activity" ADD COLUMN "groupInfo" TEXT;
ALTER TABLE "Issuance" ADD COLUMN "groupInfo" TEXT;
