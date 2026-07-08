import { describe, it, expect } from "vitest";
import { api } from "./helpers";

const login = (email: string, password: unknown) =>
  api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

describe("POST /api/auth/login", () => {
  it("happy path: valid credentials → 200 + token + user", async () => {
    const res = await login("admin.a@test.dev", "password123");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string; user?: { role?: string } };
    expect(body.token).toBeTruthy();
    expect(body.user?.role).toBe("ADMIN");
  });

  it("wrong password → 401", async () => {
    const res = await login("admin.a@test.dev", "wrong-password");
    expect(res.status).toBe(401);
  });

  it("unknown email → 401 (no account enumeration)", async () => {
    const res = await login("does-not-exist@test.dev", "password123");
    expect(res.status).toBe(401);
  });

  it("missing password → 400 (invalid input)", async () => {
    const res = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin.a@test.dev" }) });
    expect(res.status).toBe(400);
  });
});
