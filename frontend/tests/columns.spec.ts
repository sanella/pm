import { expect, test } from "@playwright/test";
import { createBoard, deleteOpenBoard, signIn } from "./helpers";

test("add, reorder and delete columns on a new board", async ({ page }) => {
  const boardName = `Columns ${Date.now()}`;
  const columnTitles = page.locator('[data-testid^="column-"]').getByLabel("Column title");
  const titles = () =>
    columnTitles.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  await signIn(page);
  // Work on a board of its own, removed at the end.
  await createBoard(page, boardName);

  await page.getByRole("button", { name: /add column/i }).click();
  await page.getByLabel("New column name").fill("Blocked");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(columnTitles).toHaveCount(6);
  await expect(columnTitles.last()).toHaveValue("Blocked");

  const backlog = page.locator('[data-testid^="column-"]').first();
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Waiting on legal");
  await backlog.getByRole("button", { name: /add card/i }).click();
  await expect(backlog.getByText("Waiting on legal")).toBeVisible();

  await page.getByRole("button", { name: "Move column Blocked left" }).click();
  await expect.poll(titles).toEqual(["Backlog", "Discovery", "In Progress", "Review", "Blocked", "Done"]);

  await page.getByRole("button", { name: "Delete column Backlog" }).click();
  await page.getByLabel("What happens to the cards").selectOption({ label: "Move to Blocked" });
  await page.getByRole("button", { name: "Delete column", exact: true }).click();
  await expect.poll(titles).toEqual(["Discovery", "In Progress", "Review", "Blocked", "Done"]);

  await page.reload();
  await expect.poll(titles).toEqual(["Discovery", "In Progress", "Review", "Blocked", "Done"]);
  const blocked = page.locator('[data-testid^="column-"]').nth(3);
  await expect(blocked.getByText("Waiting on legal")).toBeVisible();

  await deleteOpenBoard(page, boardName);
});
