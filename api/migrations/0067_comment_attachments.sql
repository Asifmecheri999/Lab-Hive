-- Multiple clickable file attachments per chat message (JSON array of {label,url}). fileUrl kept for legacy single file.
ALTER TABLE "RequestComment" ADD COLUMN "attachments" TEXT;
