-- Receipt/invoice attachment for manual OPEX expenses.
ALTER TABLE "OpexExpense" ADD COLUMN "attachmentUrl" TEXT;
