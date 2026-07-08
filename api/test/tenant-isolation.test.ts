import { describe, it, expect } from "vitest";
import { api, tokenFor, USERS, BASE } from "./helpers";

// 'itemB'/'actB' are owned by tenantB (see seed-test.sql). A tenant-A caller must never be able to
// attach them, mutate them, or read their fields back. Regression tests for the isolation audit fixes.
const FOREIGN_ITEM = "itemB";
const FOREIGN_ACTIVITY = "actB";

describe("tenant isolation — body-supplied itemId cannot cross tenants", () => {
  it("maintenance: POST /logs with another tenant's itemId → 404", async () => {
    const t = await tokenFor(USERS.adminA);
    const res = await api(
      "/api/maintenance/logs",
      { method: "POST", body: JSON.stringify({ itemId: FOREIGN_ITEM, type: "REPAIR", description: "probe" }) },
      t,
    );
    expect(res.status).toBe(404);
  });

  it("maintenance: POST /schedules with another tenant's itemId → 404", async () => {
    const t = await tokenFor(USERS.adminA);
    const res = await api(
      "/api/maintenance/schedules",
      { method: "POST", body: JSON.stringify({ itemId: FOREIGN_ITEM, title: "x", frequencyDays: 30, nextDue: "2026-08-01" }) },
      t,
    );
    expect(res.status).toBe(404);
  });

  it("experiments: a foreign itemId is dropped, never linked or leaked back", async () => {
    const t = await tokenFor(USERS.adminA);
    const create = await api(
      "/api/experiments",
      { method: "POST", body: JSON.stringify({ title: "iso-probe", items: [{ itemId: FOREIGN_ITEM, quantity: 1, consumed: true }] }) },
      t,
    );
    expect(create.status).toBe(201);
    const exp = await create.json();
    const get = await api(`/api/experiments/${exp.id}`, {}, t);
    expect(get.status).toBe(200);
    const full = await get.json();
    // The tenant-B item must not have been attached (so its fields can't leak through the include).
    expect((full.items ?? []).length).toBe(0);
    await api(`/api/experiments/${exp.id}`, { method: "DELETE" }, t); // cleanup
  });
});

describe("tenant isolation — cross-tenant writes & links are refused", () => {
  it("procurement: a foreign itemId is dropped from the request items", async () => {
    const t = await tokenFor(USERS.adminA);
    const res = await api(
      "/api/procurement",
      { method: "POST", body: JSON.stringify({ title: "iso-proc", items: [{ itemId: FOREIGN_ITEM, quantity: 1 }] }) },
      t,
    );
    expect(res.status).toBe(201);
    const p = await res.json();
    expect((p.items ?? []).length).toBe(0);
    await api(`/api/procurement/${p.id}`, { method: "DELETE" }, t); // cleanup
  });

  it("issuances: a foreign activityId and itemId are both stripped", async () => {
    const t = await tokenFor(USERS.adminA);
    const res = await api(
      "/api/issuances",
      { method: "POST", body: JSON.stringify({ studentName: "iso", activityId: FOREIGN_ACTIVITY, items: [{ itemId: FOREIGN_ITEM, quantity: 1 }] }) },
      t,
    );
    expect(res.status).toBe(201);
    const iss = await res.json();
    expect(iss.activityId ?? null).toBeNull(); // foreign activity link refused
    expect((iss.items ?? []).length).toBe(0); // foreign item dropped
    await api(`/api/issuances/${iss.id}`, { method: "DELETE" }, t); // cleanup
  });

  it("push: a different user cannot take over an existing device endpoint", async () => {
    const endpoint = "https://push.example/iso-" + Math.random().toString(36).slice(2);
    const sub = JSON.stringify({ endpoint, keys: { p256dh: "aaa", auth: "bbb" } });
    const tA = await tokenFor(USERS.adminA);
    const tB = await tokenFor(USERS.adminB);
    expect((await api("/api/push/subscribe", { method: "POST", body: sub }, tA)).status).toBe(200);
    // adminB supplying adminA's endpoint must be refused, not silently rebound.
    expect((await api("/api/push/subscribe", { method: "POST", body: sub }, tB)).status).toBe(409);
  });

  it("files: uploads are tenant-namespaced + signed, and the download rejects an unsigned URL", async () => {
    const t = await tokenFor(USERS.adminA);
    const fd = new FormData();
    fd.append("folder", "documents");
    fd.append("id", "isotest");
    fd.append("file", new File(["hello"], "note.txt", { type: "text/plain" }));
    const up = await fetch(`${BASE}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
    expect(up.status).toBe(201);
    const body = await up.json();
    expect(String(body.key).startsWith("tenantA/")).toBe(true); // namespaced, not a bare folder/id
    expect(String(body.url)).toContain("?s="); // signed
    // The signed URL streams the file with no token (so <img>/<a href> keep working).
    expect((await fetch(`${BASE}${body.url}`)).status).toBe(200);
    // Stripping the signature (or guessing the bare key) is refused.
    expect((await fetch(`${BASE}/api/files/${body.key}`)).status).toBe(404);
  });
});
