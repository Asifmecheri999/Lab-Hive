-- Record each user's agreement to the privacy policy (proof of consent).
ALTER TABLE "User" ADD COLUMN "acceptedPolicyAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "acceptedPolicyVersion" TEXT;
