import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// The board is saved on the server and shared by all tests (and by the user when
// run against the container), so each test works on its own cards and removes them.

// Columns are fixed: Backlog, Discovery, In Progress, Review, Done.
const column = (page: Page, index: number) =>
  page.locator('[data-testid^="column-"]').nth(index);

const card = (page: Page, title: string) =>
  page.locator('[data-testid^="card-"]').filter({ hasText: title });

// Locate a card by its id: the title is not text content while the card is being edited.
const cardById = async (page: Page, title: string) =>
  page.getByTestId((await card(page, title).getAttribute("data-testid"))!);

const uniqueTitle = (name: string) => `${name} ${Date.now()}`;

const addCard = async (page: Page, columnIndex: number, title: string) => {
  const target = column(page, columnIndex);
  await target.getByRole("button", { name: /add a card/i }).click();
  await target.getByPlaceholder("Card title").fill(title);
  await target.getByPlaceholder("Details").fill("Added via e2e.");
  await target.getByRole("button", { name: /add card/i }).click();
  await expect(target.getByText(title)).toBeVisible();
};

const deleteCard = async (page: Page, title: string) => {
  await page.getByRole("button", { name: `Delete ${title}` }).click();
  await expect(card(page, title)).toHaveCount(0);
};

// Mouse drag from the card body (the whole card is draggable with the mouse).
const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  const saved = page.waitForResponse((response) => response.url().endsWith("/move"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await saved;
};

const center = async (locator: ReturnType<Page["locator"]>) => {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("loads the kanban board", async ({ page }) => {
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card that persists after reload", async ({ page }) => {
  const title = uniqueTitle("Added card");
  await addCard(page, 0, title);
  await page.reload();
  await expect(column(page, 0).getByText(title)).toBeVisible();
  await deleteCard(page, title);
});

test("deletes a card and it stays deleted after reload", async ({ page }) => {
  const title = uniqueTitle("Deleted card");
  await addCard(page, 0, title);
  await deleteCard(page, title);
  await page.reload();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(card(page, title)).toHaveCount(0);
});

test("edits a card and the edit persists after reload", async ({ page }) => {
  const title = uniqueTitle("Card to edit");
  const edited = uniqueTitle("Edited card");
  await addCard(page, 0, title);
  const target = await cardById(page, title);
  await target.getByRole("button", { name: `Edit ${title}` }).click();
  await target.getByLabel("Edit card title").fill(edited);
  await target.getByLabel("Edit card details").fill("New details.");
  await target.getByRole("button", { name: /save/i }).click();
  await expect(card(page, edited).getByText("New details.")).toBeVisible();

  await page.reload();
  await expect(card(page, edited).getByText("New details.")).toBeVisible();
  await deleteCard(page, edited);
});

test("renames a column and the name persists after reload", async ({ page }) => {
  const title = column(page, 3).getByLabel("Column title");
  const original = await title.inputValue();
  const renamed = uniqueTitle("QA");
  const saved = page.waitForResponse((response) => response.url().includes("/api/columns/"));
  await title.fill(renamed);
  await title.press("Enter");
  await saved;
  await expect(page.locator("header").getByText(renamed, { exact: true })).toBeVisible();

  await page.reload();
  await expect(column(page, 3).getByLabel("Column title")).toHaveValue(renamed);
  await column(page, 3).getByLabel("Column title").fill(original);
  await column(page, 3).getByLabel("Column title").press("Enter");
  await expect(page.locator("header").getByText(original, { exact: true })).toBeVisible();
});

test("moves a card between columns and the move persists after reload", async ({ page }) => {
  const title = uniqueTitle("Dragged card");
  await addCard(page, 0, title);
  const from = await center(page.getByRole("heading", { name: title }));
  const columnBox = (await column(page, 3).boundingBox())!;
  await drag(page, from, { x: columnBox.x + columnBox.width / 2, y: columnBox.y + 120 });
  await expect(column(page, 3).getByText(title)).toBeVisible();

  await page.reload();
  await expect(column(page, 3).getByText(title)).toBeVisible();
  await deleteCard(page, title);
});

test("reorders cards within a column and the order persists after reload", async ({ page }) => {
  const first = uniqueTitle("First card");
  const second = uniqueTitle("Second card");
  await addCard(page, 1, first);
  await addCard(page, 1, second);
  const from = await center(page.getByRole("heading", { name: first }));
  const to = await center(card(page, second));
  await drag(page, from, { x: to.x, y: to.y + 5 });

  const lastTwo = async () =>
    (await column(page, 1).locator('[data-testid^="card-"] h4').allTextContents()).slice(-2);
  await expect.poll(lastTwo).toEqual([second, first]);
  await page.reload();
  await expect.poll(lastTwo).toEqual([second, first]);
  await deleteCard(page, first);
  await deleteCard(page, second);
});

test("moves a card with the keyboard", async ({ page }) => {
  const title = uniqueTitle("Keyboard card");
  await addCard(page, 0, title);
  const cardId = (await card(page, title).getAttribute("data-testid"))!.replace("card-", "");
  const handle = page.getByRole("button", { name: `Drag ${title}` });
  // dnd-kit reacts to each key asynchronously; wait for its announcement before the next key.
  const announcement = page.locator('[id^="DndLiveRegion"]');
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(announcement).toContainText(`moved over droppable area ${cardId}`);
  // An arrow key pressed right after pickup is sometimes ignored while dnd-kit is still
  // measuring drop targets, so press again until the card is over another target.
  await expect(async () => {
    await page.keyboard.press("ArrowRight");
    await expect(announcement).toHaveText(
      new RegExp(`moved over droppable area (?!${cardId}\\.)`),
      { timeout: 1000 }
    );
  }).toPass();
  const saved = page.waitForResponse((response) => response.url().endsWith("/move"));
  await page.keyboard.press("Space");
  await saved;
  await expect(column(page, 1).getByText(title)).toBeVisible();
  await deleteCard(page, title);
});

test("Space on a card's Edit button opens the editor instead of dragging", async ({ page }) => {
  const title = uniqueTitle("Editable card");
  await addCard(page, 0, title);
  const target = await cardById(page, title);
  await target.getByRole("button", { name: `Edit ${title}` }).focus();
  await page.keyboard.press("Space");
  await expect(target.getByLabel("Edit card title")).toBeVisible();
  await target.getByRole("button", { name: /cancel/i }).click();
  await deleteCard(page, title);
});
