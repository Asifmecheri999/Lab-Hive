-- Vendor attachments (VAT certificate, trade licence, etc.) — JSON array of {label,url}.
ALTER TABLE "Vendor" ADD COLUMN "documents" TEXT;
