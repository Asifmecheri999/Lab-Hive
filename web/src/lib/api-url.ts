// Single source of truth for the backend API base URL.
//
// Set NEXT_PUBLIC_API_URL PER ENVIRONMENT — local dev via web/.env.local, and
// staging/production via each Worker's wrangler.toml [vars]. Because NEXT_PUBLIC_*
// values are inlined at build time, each environment's build bakes in its own API URL.
//
// The localhost fallback is only a last-resort for a build with the var unset — it is
// intentionally localhost (not a real deployment URL) so a misconfigured staging build
// fails obviously instead of silently talking to production.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
