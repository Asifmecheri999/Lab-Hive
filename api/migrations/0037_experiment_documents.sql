-- Experiments get a flexible documents list (pulled from items + manual), replacing fixed slots.
ALTER TABLE "Experiment" ADD COLUMN "documents" TEXT;
