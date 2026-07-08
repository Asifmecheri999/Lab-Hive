// Signed file URLs. The R2 download endpoint (api/src/routes/files.ts) is public so the frontend
// can render files with tokenless <img src> / <a href>. To stop a raw/guessed/stripped key from
// being fetchable, the API mints an HMAC signature over the key at upload time and embeds it in the
// stored URL (?s=<sig>); the download route refuses any key without a valid signature. So a file can
// only be fetched through a URL the API itself produced for someone it authorised to see the record.
//
// The signature is deterministic (no expiry) so a stored URL never breaks and is safe to persist and
// re-submit. A short-TTL variant (leaked URLs expire) is a sensible future hardening; it needs
// re-signing on read, so it's deferred to avoid touching every response shape.
const enc = new TextEncoder()

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function signFileKey(key: string, secret: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(key))
  return b64url(sig)
}

export async function verifyFileKey(key: string, sig: string | undefined | null, secret: string): Promise<boolean> {
  if (!sig) return false
  const expected = await signFileKey(key, secret)
  // constant-time-ish compare
  if (expected.length !== sig.length) return false
  let d = 0
  for (let i = 0; i < expected.length; i++) d |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return d === 0
}
