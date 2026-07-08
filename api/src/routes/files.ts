// File storage via Cloudflare R2. Upload (any logged-in user) + download (any logged-in user).
// Path conventions: /{folder}/{id}/{filename}
import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { requireAuth, type AuthVars } from '../middleware/auth'
import { signFileKey, verifyFileKey } from '../lib/filesign'

const FOLDERS = ['invoices', 'quotations', 'service-requests', 'requests', 'documents', 'maintenance', 'safety', 'inventory', 'facilities', 'procurement', 'experiments', 'tenants', 'vendors', 'opex']
const files = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// POST /api/files/upload  (multipart: file, folder, id) -> { url, key }
files.post('/upload', requireAuth, async (c) => {
  if (!c.env.FILES) return c.json({ error: 'R2 not configured' }, 503)
  const u = c.get('user')
  const form = await c.req.formData()
  const file = form.get('file')
  const folder = String(form.get('folder') ?? 'documents')
  const id = String(form.get('id') ?? 'misc').replace(/[^a-zA-Z0-9._-]/g, '_')

  if (!(file instanceof File)) return c.json({ error: 'file is required' }, 400)
  if (!FOLDERS.includes(folder)) return c.json({ error: `folder must be one of ${FOLDERS.join(', ')}` }, 400)

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  // Namespace every object under the caller's tenant (server-derived, NEVER a body field) so a
  // tenant can only write within its own prefix — one tenant can no longer overwrite or plant a
  // file under another tenant's key. Super admins (no tenant) use a 'platform' prefix. #tenant-isolation
  const scope = u.superAdmin ? 'platform' : (u.tenant || 'shared')
  const key = `${scope}/${folder}/${id}/${safeName}`
  await c.env.FILES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  })
  // Stored URL points at our download endpoint (R2 bucket is private) and carries a signature
  // (?s=) so the file can only be fetched back through this API-minted URL. #tenant-isolation
  const sig = await signFileKey(key, c.env.AUTH_SECRET)
  return c.json({ key, url: `/api/files/${key}?s=${sig}` }, 201)
})

// GET /api/files/<key...>?s=<sig>  -> streams the object.
// Public (no requireAuth) so the frontend can render files with tokenless <img src> / <a href> /
// window.open. Access is gated by an HMAC signature the API minted at upload and embedded in the
// stored URL: a request with no/invalid ?s is refused (404), so a raw, guessed, or sig-stripped key
// is not fetchable. Uploads are also tenant-namespaced (see /upload) so cross-tenant WRITES are
// blocked. (A leaked signed URL is still replayable — short-TTL signing is a future hardening.)
files.get('/*', async (c) => {
  if (!c.env.FILES) return c.json({ error: 'R2 not configured' }, 503)
  const key = c.req.path.replace(/^\/api\/files\//, '')
  if (!key || key.includes('..')) return c.json({ error: 'Not found' }, 404)
  if (!(await verifyFileKey(key, c.req.query('s'), c.env.AUTH_SECRET))) return c.json({ error: 'Not found' }, 404)
  const obj = await c.env.FILES.get(key)
  if (!obj) return c.json({ error: 'Not found' }, 404)
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  return new Response(obj.body, { headers })
})

export default files
