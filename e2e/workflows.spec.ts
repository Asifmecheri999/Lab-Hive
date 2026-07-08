import { test, expect } from "@playwright/test";
import { login, CREDS } from "./helpers";

// Faculty main workflow: reach Requests and open the RA submission form.
test("faculty: can reach Requests and open the RA submission form", async ({ page }) => {
  await login(page, CREDS.facultyA);
  await page.goto("/requests");

  // Faculty see the RA Submission tab (they submit + supervise RAs).
  await page.getByRole("button", { name: /RA Submission/i }).click();
  await page.getByRole("button", { name: /\+ Submit RA/i }).click();

  // The submission dialog opens with the Title field.
  await expect(page.getByText(/Submit Risk Assessment/i)).toBeVisible();
});

// Student main workflow: reach Requests and open a new job request form.
test("student: can reach Requests and open a new job request", async ({ page }) => {
  await login(page, CREDS.studentA);
  await page.goto("/requests");

  await page.getByRole("button", { name: /\+ New request/i }).click();

  // The new-job-request dialog opens.
  await expect(page.getByText(/New job request/i)).toBeVisible();
});
