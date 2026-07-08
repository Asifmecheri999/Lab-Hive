import { defineConfig } from "@playwright/test";

// E2E tests run the FULL local stack against the LOCAL miniflare D1 (never production):
//   • API worker  — `wrangler dev` on :8788 (seeded via `npm run test:e2e`)
//   • Web frontend — `next dev` on :3000, pointed at the :8788 API so the browser + the
//     NextAuth server-side calls both hit the local test API, never production.
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "npm --prefix api run test:server",
      url: "http://127.0.0.1:8788/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "npm --prefix web run dev",
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        // Point the frontend (browser bundle + server-side NextAuth) at the LOCAL test API.
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:8788",
        API_URL: "http://127.0.0.1:8788",
        AUTH_SECRET: "e2e-nextauth-secret-not-used-in-prod",
      },
    },
  ],
});
