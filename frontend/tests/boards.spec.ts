import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("create, use, switch, rename and delete a board", async ({ page }) => {
  const name = `E2E board ${Date.now()}`;
  const renamed = `${name} renamed`;
  const boards = page.getByRole("navigation", { name: "Boards" });
  const columns = page.locator('[data-testid^="column-"]');
  await signIn(page);
  const firstBoard = await boards.getByRole("button").first().textContent();

  await page.getByRole("button", { name: /new board/i }).click();
  await page.getByLabel("Board name").fill(name);
  await page.getByRole("button", { name: /create board/i }).click();
  await expect(boards.getByRole("button", { name })).toHaveAttribute("aria-current", "page");
  // A new board has the default columns and no cards.
  await expect(columns).toHaveCount(5);
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);

  await columns.first().getByRole("button", { name: /add a card/i }).click();
  await columns.first().getByPlaceholder("Card title").fill("Only on the new board");
  await columns.first().getByRole("button", { name: /add card/i }).click();
  await expect(page.getByText("Only on the new board")).toBeVisible();

  // The last open board is reopened after a reload.
  await page.reload();
  await expect(boards.getByRole("button", { name })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Only on the new board")).toBeVisible();

  await boards.getByRole("button", { name: firstBoard! }).click();
  await expect(boards.getByRole("button", { name: firstBoard! })).toHaveAttribute("aria-current", "page");
  await expect(columns).toHaveCount(5);
  await expect(page.getByText("Only on the new board")).toHaveCount(0);

  await boards.getByRole("button", { name }).click();
  await page.getByRole("button", { name: /rename board/i }).click();
  await page.getByLabel("Board name").fill(renamed);
  await page.getByRole("button", { name: /save name/i }).click();
  await expect(boards.getByRole("button", { name: renamed })).toBeVisible();
  await page.reload();
  await expect(boards.getByRole("button", { name: renamed })).toHaveAttribute("aria-current", "page");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /delete board/i }).click();
  await expect(boards.getByRole("button", { name: renamed })).toHaveCount(0);
  await expect(boards.getByRole("button", { name: firstBoard! })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(boards.getByRole("button", { name: renamed })).toHaveCount(0);
});
