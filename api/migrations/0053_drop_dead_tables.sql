-- Remove dead/orphaned tables: InventoryCheckout (never written; superseded by Issuances)
-- and ExperimentSession (created but never shown on the timetable; scheduling uses TimetableEntry).
DROP TABLE IF EXISTS "InventoryCheckout";
DROP TABLE IF EXISTS "ExperimentSession";
