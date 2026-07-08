-- Link inventory + maintenance into Finance: a flag that routes them into the CAPEX/OPEX managers.
ALTER TABLE "InventoryItem" ADD COLUMN "financeMode" TEXT;
ALTER TABLE "MaintenanceLog" ADD COLUMN "includeInOpex" BOOLEAN NOT NULL DEFAULT true;
