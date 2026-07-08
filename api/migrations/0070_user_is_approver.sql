-- Mark which users can be picked as procurement approvers (tick-box in Users).
ALTER TABLE "User" ADD COLUMN "isApprover" BOOLEAN NOT NULL DEFAULT 0;
