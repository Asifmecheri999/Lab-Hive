import { describe, it, expect } from "vitest";
import { api } from "./helpers";

describe("GET /api/health", () => {
  it("returns ok and a connected D1", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; db: string };
    expect(body.status).toBe("ok");
    expect(body.db).toBe("connected");
  });
});
