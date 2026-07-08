# Security policy

LabSynch is a multi-tenant application, so isolation and auth matter. If you find a security issue,
please **report it privately** rather than opening a public issue:

- Email: **info@labsynch.com** (or open a private security advisory on GitHub).
- Please include steps to reproduce and the impact. We'll acknowledge and work on a fix.

**Please do not** run automated scanners or penetration tests against the live **labsynch.com**
instance without permission — it's a real, in-use deployment. Test against your own local or
self-hosted copy instead.

## For self-hosters
- Always set your **own** `AUTH_SECRET` as a `wrangler secret` (never a plaintext var). The CI has a
  guard that fails the build if a plaintext `AUTH_SECRET` is committed.
- Keep secrets in `wrangler secret put` / a gitignored `.dev.vars` — never commit them.
- File downloads are gated by a signed URL; keep uploads tenant-namespaced (both are in the code).
