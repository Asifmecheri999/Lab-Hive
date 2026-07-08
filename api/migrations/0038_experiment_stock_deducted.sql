-- Track whether an experiment's used consumables have already been deducted from inventory (one-way action).
ALTER TABLE "Experiment" ADD COLUMN "stockDeducted" BOOLEAN NOT NULL DEFAULT 0;
