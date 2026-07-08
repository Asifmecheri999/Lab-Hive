-- Optional per-workspace AI provider API key to enable the smart assistant. The workspace owner pays their provider per use.
ALTER TABLE "Tenant" ADD COLUMN "aiApiKey" TEXT;
