import { describe, it, expect, beforeAll } from "vitest";
import { api, tokenFor, USERS } from "./helpers";

let adminA = "";
let studentA = "";

beforeAll(async () => {
  adminA = await tokenFor(USERS.adminA);
  studentA = await tokenFor(USERS.studentA);
});

describe("GET /api/users — auth + role + tenant scoping", () => {
  it("happy path: ADMIN sees only their own tenant's users", async () => {
    const res = await api("/api/users", {}, adminA);
    expect(res.status).toBe(200);
    const list = (await res.json()) as { email: string }[];
    const emails = list.map((u) => u.email);
    expect(emails).toContain("admin.a@test.dev");
    // Tenant isolation: tenant A must NOT see tenant B's users.
    expect(emails).not.toContain("admin.b@test.dev");
  });

  it("unauthorized: no token → 401", async () => {
    const res = await api("/api/users");
    expect(res.status).toBe(401);
  });

  it("forbidden: a STUDENT token cannot list users → 403", async () => {
    const res = await api("/api/users", {}, studentA);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/users — invalid input", () => {
  it("missing required fields → 400", async () => {
    const res = await api("/api/users", { method: "POST", body: JSON.stringify({ email: "x@test.dev" }) }, adminA);
    expect(res.status).toBe(400);
  });
});

describe("multitenancy: cross-tenant access is blocked", () => {
  it("tenant A admin cannot modify tenant B's user via URL id → 404 (not found for them)", async () => {
    const res = await api("/api/users/t_adminB", { method: "PUT", body: JSON.stringify({ name: "Hijacked" }) }, adminA);
    expect(res.status).toBe(404);
  });
});
