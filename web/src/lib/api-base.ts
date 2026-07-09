import { getCloudflareContext } from "@opennextjs/cloudflare";

// Fallback API base for local dev (next dev reads .env.local) or if the binding is absent.
const API_URL = process.env.API_URL ?? "https://api.labsynch.com";

// Low-level request to the API. Prefers the Cloudflare service binding (Worker->Worker,
// no public hop / no loopback); falls back to a normal fetch in dev.
export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  try {
    const { env } = getCloudflareContext();
    const api = (env as unknown as { API?: { fetch: typeof fetch } }).API;
    if (api) return api.fetch(`https://api${path}`, init);
  } catch {
    // not in a Cloudflare context (e.g. next dev) — fall through to global fetch
  }
  return fetch(`${API_URL}${path}`, init);
}
