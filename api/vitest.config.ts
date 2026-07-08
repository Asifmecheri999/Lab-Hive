import { defineConfig } from "vitest/config";

// API tests run in Node and hit a REAL `wrangler dev` (started by the npm script via
// start-server-and-test) on http://localhost:8788, backed by the LOCAL miniflare D1 —
// never remote/production. This exercises the real worker: routing, auth, Prisma + D1.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false, // one shared local DB — run test files serially
  },
});
