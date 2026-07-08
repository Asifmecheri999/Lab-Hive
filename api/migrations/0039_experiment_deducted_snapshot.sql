-- Snapshot of quantities already deducted per item, so re-syncing applies only the difference.
ALTER TABLE "Experiment" ADD COLUMN "deductedSnapshot" TEXT;
