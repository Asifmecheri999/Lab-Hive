// Auth helpers for the Lab Hive API (runs on the Workers runtime).
// - Password hashing/verification with Web Crypto PBKDF2 (no native bcrypt on Workers).
// - JWT signing/verification with jose (HS256).
import { SignJWT, jwtVerify } from 'jose'

const PBKDF2_ITERATIONS = 100_000
const enc = new TextEncoder()

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return toB64(bits)
}

// Produce a self-describing hash string: pbkdf2$<iter>$<saltB64>$<hashB64>
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${hash}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = parseInt(parts[1], 10)
  const salt = fromB64(parts[2])
  const expected = parts[3]
  const actual = await pbkdf2(password, salt, iterations)
  // constant-time-ish compare
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export interface AuthClaims {
  sub: string // user id
  email: string
  name: string
  role: string
  tenant?: string // tenant id
  plan?: string   // DEMO | DEPARTMENT | ENTERPRISE
  status?: string // tenant status: trial | active | suspended | expired (refreshed live per request)
  superAdmin?: boolean // platform owner — can manage all organisations
}

export async function signToken(claims: AuthClaims, secret: string): Promise<string> {
  return new SignJWT({ email: claims.email, name: claims.name, role: claims.role, tenant: claims.tenant, plan: claims.plan, superAdmin: claims.superAdmin })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(enc.encode(secret))
}

export async function verifyToken(token: string, secret: string): Promise<AuthClaims | null> {
  try {
    const { payload } = await jwtVerify(token, enc.encode(secret))
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      tenant: payload.tenant as string | undefined,
      plan: payload.plan as string | undefined,
      superAdmin: payload.superAdmin as boolean | undefined,
    }
  } catch {
    return null
  }
}
