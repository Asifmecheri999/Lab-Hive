-- PR can be handled inside LabSynch (approval workflow) or externally; plus a default approver per workspace.
ALTER TABLE "ProcurementRequest" ADD COLUMN "external" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "defaultApproverEmail" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "defaultApproverName" TEXT;
