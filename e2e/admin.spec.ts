import { test, expect } from "@playwright/test";
import { login, CREDS } from "./helpers";

// Admin main workflow: manage users — AND the multitenancy guarantee that the UI only
// ever shows the admin's own tenant, never another tenant's data.
test("admin: Users page lists own-tenant users only (tenant isolation)", async ({ page }) => {
  await login(page, CREDS.adminA);
  await page.goto("/users");

  // Own-tenant user is visible.
  await expect(page.getByText("admin.a@test.dev")).toBeVisible();

  // Tenant B's admin must NEVER appear in tenant A's UI — even though the row exists in
  // the shared database. This is the browser-level multitenancy check.
  await expect(page.getByText("admin.b@test.dev")).toHaveCount(0);
});
