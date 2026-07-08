-- Activity: user (name/type/email) + school/department from org hierarchy
ALTER TABLE "Activity" ADD COLUMN "userName" TEXT;
ALTER TABLE "Activity" ADD COLUMN "userType" TEXT;
ALTER TABLE "Activity" ADD COLUMN "userEmail" TEXT;
ALTER TABLE "Activity" ADD COLUMN "school" TEXT;
ALTER TABLE "Activity" ADD COLUMN "department" TEXT;

-- Issuance: supervisor name + school/department
ALTER TABLE "Issuance" ADD COLUMN "supervisorName" TEXT;
ALTER TABLE "Issuance" ADD COLUMN "school" TEXT;
ALTER TABLE "Issuance" ADD COLUMN "department" TEXT;
