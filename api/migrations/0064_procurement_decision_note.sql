-- Approver's message back to the requester when approving / holding / rejecting a purchase request.
ALTER TABLE "ProcurementRequest" ADD COLUMN "decisionNote" TEXT;
