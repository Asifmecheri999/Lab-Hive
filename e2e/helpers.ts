import { Page, expect } from "@playwright/test";

// Seeded test users (see api/test/seed-test.sql). Password for all: "password123".
export const CREDS = {
  adminA: "admin.a@test.dev",
  facultyA: "faculty.a@test.dev",
  studentA: "student.a@test.dev",
};

// Log in through the real UI and wait for the dashboard.
export async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByPlaceholder("you@email.com").fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  // App shell rendered → the standalone sidebar "Dashboard" link is present for every role.
  await expect(page.getByRole("link", { name: /^Dashboard$/ })).toBeVisible();
}
