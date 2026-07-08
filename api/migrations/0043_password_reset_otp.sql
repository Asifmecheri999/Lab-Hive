-- Password reset via emailed OTP.
ALTER TABLE "User" ADD COLUMN "resetOtp" TEXT;
ALTER TABLE "User" ADD COLUMN "resetOtpExpires" DATETIME;
