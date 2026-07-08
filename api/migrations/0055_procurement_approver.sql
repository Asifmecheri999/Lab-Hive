-- Route purchase requests to a specific approver (Dean / faculty) for approve/reject/hold.
ALTER TABLE "ProcurementRequest" ADD COLUMN "approverEmail" TEXT;
ALTER TABLE "ProcurementRequest" ADD COLUMN "approverName" TEXT;
