import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("loads the kanban board", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  // Grab the card body (not the handle): the whole card is draggable with the mouse.
  const card = page.getByRole("heading", { name: "Align roadmap themes" });
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("edits a card", async ({ page }) => {
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: /edit align roadmap themes/i }).click();
  await card.getByLabel("Edit card title").fill("Edited via e2e");
  await card.getByLabel("Edit card details").fill("New details.");
  await card.getByRole("button", { name: /save/i }).click();
  await expect(card.getByText("Edited via e2e")).toBeVisible();
  await expect(card.getByText("New details.")).toBeVisible();
});

test("moves a card with the keyboard", async ({ page }) => {
  const handle = page.getByRole("button", { name: "Drag Align roadmap themes" });
  // dnd-kit reacts to each key asynchronously; wait for its announcement before the next key.
  const announcement = page.locator('[id^="DndLiveRegion"]');
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(announcement).toContainText("moved over droppable area card-1");
  await page.keyboard.press("ArrowRight");
  await expect(announcement).toContainText("moved over droppable area card-3");
  await page.keyboard.press("Space");
  await expect(
    page.getByTestId("column-col-discovery").getByTestId("card-card-1")
  ).toBeVisible();
});

test("renames a column", async ({ page }) => {
  const title = page.getByTestId("column-col-review").getByLabel("Column title");
  await title.fill("QA");
  await title.press("Enter");
  await expect(page.locator("header").getByText("QA", { exact: true })).toBeVisible();
});

test("reorders cards within a column by dragging the card", async ({ page }) => {
  const column = page.getByTestId("column-col-progress");
  const from = (await page.getByRole("heading", { name: "Refine status language" }).boundingBox())!;
  const to = (await page.getByTestId("card-card-5").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 5, { steps: 12 });
  await page.mouse.up();
  await expect(column.locator('[data-testid^="card-"]')).toHaveText([
    /Design card layout/,
    /Refine status language/,
  ]);
});

test("Space on a card's Edit button opens the editor instead of dragging", async ({ page }) => {
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: /edit align roadmap themes/i }).focus();
  await page.keyboard.press("Space");
  await expect(card.getByLabel("Edit card title")).toBeVisible();
});
