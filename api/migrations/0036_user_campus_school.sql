-- Users get campus + school (alongside department), sourced from the org hierarchy.
ALTER TABLE "User" ADD COLUMN "campus" TEXT;
ALTER TABLE "User" ADD COLUMN "school" TEXT;
