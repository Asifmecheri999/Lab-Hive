-- Procurement is charged against a budget year (shown instead of CAPEX/OPEX).
ALTER TABLE "ProcurementRequest" ADD COLUMN "budgetYear" INTEGER;
