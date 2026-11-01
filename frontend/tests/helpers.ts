import { expect, type Page } from "@playwright/test";

export const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

// Creates a board and waits until it is open (the previous board must not be acted on).
export const createBoard = async (page: Page, name: string) => {
  await page.getByRole("button", { name: /new board/i }).click();
  await page.getByLabel("Board name").fill(name);
  await page.getByRole("button", { name: /create board/i }).click();
  await expect(page.getByRole("button", { name })).toHaveAttribute("aria-current", "page");
  // A new board's five columns are empty.
  await expect(page.getByText("Drop a card here")).toHaveCount(5);
};

export const deleteOpenBoard = async (page: Page, name: string) => {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /delete board/i }).click();
  await expect(page.getByRole("button", { name })).toHaveCount(0);
};
