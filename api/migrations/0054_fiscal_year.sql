-- Configurable fiscal year start month (1=Jan calendar default). Only changes how Finance groups dates.
ALTER TABLE "Tenant" ADD COLUMN "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1;
