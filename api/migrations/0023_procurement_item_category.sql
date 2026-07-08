-- Procurement line-item type/category (Equipment, Consumable, Software, …) for budget breakdown
ALTER TABLE "ProcurementItem" ADD COLUMN "category" TEXT;
