import { SignJWT } from "jose";

// Base URL of the wrangler-dev worker under test (started by the npm script).
export const BASE = process.env.TEST_API_URL ?? "http://127.0.0.1:8788";

// Must match api/wrangler.toml [vars] AUTH_SECRET (what `wrangler dev` runs with),
// so the tokens we mint here verify inside the worker.
const DEV_SECRET = "dev-only-change-me-in-production-please-use-a-long-random-string";
const enc = new TextEncoder();

type Claims = { sub: string; email: string; name: string; role: string; tenant?: string };

// Mint a valid Bearer token for a seeded user (same shape/algorithm as the API).
export async function tokenFor(u: Claims): Promise<string> {
  return new SignJWT({ email: u.email, name: u.name, role: u.role, tenant: u.tenant })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(enc.encode(DEV_SECRET));
}

// Seeded users (see test/seed-test.sql). Password for all: "password123".
export const USERS = {
  adminA: { sub: "t_adminA", email: "admin.a@test.dev", name: "Admin A", role: "ADMIN", tenant: "tenantA" },
  facultyA: { sub: "t_facultyA", email: "faculty.a@test.dev", name: "Faculty A", role: "FACULTY", tenant: "tenantA" },
  studentA: { sub: "t_studentA", email: "student.a@test.dev", name: "Student A", role: "STUDENT", tenant: "tenantA" },
  adminB: { sub: "t_adminB", email: "admin.b@test.dev", name: "Admin B", role: "ADMIN", tenant: "tenantB" },
} as const;

// Call the API. Pass a token to authenticate.
export function api(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...((init.headers as Record<string, string>) ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { ...init, headers });
}
