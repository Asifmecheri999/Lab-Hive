-- OPEX provenance (use/experiment) + multi-file attachments on OPEX and budget lines.
ALTER TABLE "OpexExpense" ADD COLUMN "attachments" TEXT;
ALTER TABLE "OpexExpense" ADD COLUMN "source" TEXT;
ALTER TABLE "BudgetLine" ADD COLUMN "attachments" TEXT;
