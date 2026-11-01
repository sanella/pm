import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("requires login to see the board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toHaveCount(0);
});

test("shows an error for wrong credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  // Filter by text: Next.js also renders an empty role="alert" route announcer.
  await expect(
    page.getByRole("alert").filter({ hasText: /invalid username or password/i })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toHaveCount(0);
});

test("stays signed in after reload", async ({ page }) => {
  await signIn(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("logs out and stays logged out after reload", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test("signs in regardless of username case and stray spaces", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill(" USER ");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText("Signed in as user")).toBeVisible();
});
