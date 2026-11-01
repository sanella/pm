import { expect, test, type Page } from "@playwright/test";

const signInAs = async (page: Page, username: string, password: string) => {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
};

test("register, sign out and in, change password, delete account", async ({ page }) => {
  const username = `e2e_${Date.now()}`;
  await page.goto("/");

  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("first-password");
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
  // A new account starts with its own board.
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.getByRole("button", { name: /log out/i }).click();
  await signInAs(page, username, "first-password");
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();

  await page.getByRole("button", { name: /^account$/i }).click();
  const dialog = page.getByRole("dialog", { name: "Account" });
  await dialog.getByLabel("Current password").fill("first-password");
  await dialog.getByLabel("New password").fill("second-password");
  await dialog.getByRole("button", { name: /change password/i }).click();
  await expect(dialog.getByRole("status")).toHaveText("Password changed.");
  await dialog.getByRole("button", { name: /close/i }).click();

  await page.getByRole("button", { name: /log out/i }).click();
  await signInAs(page, username, "first-password");
  await expect(
    page.getByRole("alert").filter({ hasText: /invalid username or password/i })
  ).toBeVisible();
  await signInAs(page, username, "second-password");
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();

  await page.getByRole("button", { name: /^account$/i }).click();
  await dialog.getByLabel("Password to confirm deletion").fill("second-password");
  await dialog.getByRole("button", { name: /delete account/i }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await signInAs(page, username, "second-password");
  await expect(
    page.getByRole("alert").filter({ hasText: /invalid username or password/i })
  ).toBeVisible();
});

test("a taken username is refused", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("any-password");
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: /taken/i })).toBeVisible();
});
