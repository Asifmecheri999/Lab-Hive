-- Procurement deliverables: delivery note + per-item received/unit-cost/pushed state.
ALTER TABLE "ProcurementRequest" ADD COLUMN "deliveryNoteUrl" TEXT;
ALTER TABLE "ProcurementRequest" ADD COLUMN "deliverables" TEXT;
