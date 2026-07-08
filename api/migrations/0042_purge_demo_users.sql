-- (Retired) This was a one-time production go-live cleanup that removed demo/seed users and
-- installed the initial admin account for the maintainer's own deployment. It is intentionally
-- left as a no-op so the migration history stays intact for databases that already ran it,
-- while fresh installs keep their seeded example users. Nothing to apply here.
SELECT 1;
