import { test, expect } from "@playwright/test";
import { login, CREDS } from "./helpers";

test("login → dashboard loads", async ({ page }) => {
  await login(page, CREDS.adminA);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("bad password shows an error and stays on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@email.com").fill(CREDS.adminA);
  await page.locator('input[type="password"]').first().fill("wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/couldn.t sign in|invalid/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

// After a forced first-login password reset the user is bounced to /login?reset=1 — they must be
// told to use the NEW password (regression for new users retyping the temp one and failing).
test("post-reset banner tells the user to sign in with the new password", async ({ page }) => {
  await page.goto("/login?reset=1");
  await expect(page.getByText(/sign in with it now/i)).toBeVisible();
  await expect(page.getByPlaceholder("you@email.com")).toBeVisible(); // form still there
});
