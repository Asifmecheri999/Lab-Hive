-- Activity lifecycle status (ACTIVE | COMPLETED) so the lab team can close/finish an activity.
ALTER TABLE "Activity" ADD COLUMN "status" TEXT DEFAULT 'ACTIVE';
