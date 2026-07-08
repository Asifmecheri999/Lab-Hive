-- PPERequest now also holds resource requests; distinguish by type (PPE | RESOURCE)
ALTER TABLE "PPERequest" ADD COLUMN "type" TEXT DEFAULT 'PPE';
