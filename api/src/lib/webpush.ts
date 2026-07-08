// Minimal Web Push — RFC 8291 (aes128gcm) + RFC 8292 (VAPID) using Web Crypto. Runs on Cloudflare Workers.
import type { Env } from './db'
import { getPrisma } from './db'
import { fetchWithTimeout } from './net'

const b64urlToBytes = (s: string): Uint8Array => {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s); const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}
const bytesToB64url = (b: Uint8Array): string => {
  let bin = ''; for (const x of b) bin += String.fromCharCode(x)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const concat = (...arrs: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0)); let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length } return out
}
const utf8 = (s: string) => new TextEncoder().encode(s)

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8))
}

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } }

async function vapidAuth(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const u = new URL(endpoint)
  const aud = `${u.protocol}//${u.host}`
  const header = bytesToB64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToB64url(utf8(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })))
  const signingInput = `${header}.${payload}`
  const pub = b64urlToBytes(publicKey) // 0x04 || x(32) || y(32)
  const jwk = { kty: 'EC', crv: 'P-256', x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), d: privateKey, ext: true }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signingInput)))
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${publicKey}`
}

export async function sendPush(env: Env, sub: PushSub, payload: unknown): Promise<{ ok: boolean; status: number }> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { ok: false, status: 0 }
  const plaintext = utf8(JSON.stringify(payload))
  const uaPublic = b64urlToBytes(sub.keys.p256dh)
  const authSecret = b64urlToBytes(sub.keys.auth)
  const asPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asPair.publicKey)) // 65 bytes
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPair.privateKey, 256))
  const ikm = await hkdf(authSecret, ecdh, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, concat(plaintext, new Uint8Array([2]))))
  const head = new Uint8Array(16 + 4 + 1 + 65)
  head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096, false); head[20] = 65; head.set(asPublic, 21)
  const body = concat(head, ciphertext)
  const auth = await vapidAuth(sub.endpoint, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.MAIL_FROM ? `mailto:${env.MAIL_FROM}` : 'mailto:info@labsynch.com')
  const r = await fetchWithTimeout(sub.endpoint, { method: 'POST', headers: { Authorization: auth, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400' }, body }, 8000)
  return { ok: r.ok, status: r.status }
}

// Send a notification to all of a user's devices; prunes dead subscriptions (404/410).
export async function notifyUser(env: Env, userId: string, payload: { title: string; body: string; url?: string }): Promise<number> {
  if (!env.VAPID_PUBLIC_KEY) return 0
  const prisma = getPrisma(env.DB)
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  let sent = 0
  for (const s of subs) {
    try {
      const res = await sendPush(env, { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      if (res.ok) sent++
      else if (res.status === 404 || res.status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
    } catch { /* ignore one device */ }
  }
  return sent
}
