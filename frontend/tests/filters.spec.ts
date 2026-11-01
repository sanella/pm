import { expect, test } from "@playwright/test";
import { createBoard, deleteOpenBoard, signIn } from "./helpers";

test("filter the board, drag a matching card, clear the filter", async ({ page }) => {
  const stamp = Date.now();
  const title = `Filtered card ${stamp}`;
  const label = `tag${stamp}`;
  const columns = page.locator('[data-testid^="column-"]');
  const cards = page.locator('[data-testid^="card-"]');
  await signIn(page);
  // A board of its own: other test files change the demo board in parallel.
  const boardName = `Filters ${stamp}`;
  await createBoard(page, boardName);
  const backlog = columns.first();
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Other card");
  await backlog.getByRole("button", { name: /add card/i }).click();

  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill(title);
  await backlog.getByLabel("Labels").fill(label);
  await backlog.getByRole("button", { name: /add card/i }).click();
  await expect(backlog.getByText(title)).toBeVisible();
  await expect(cards).toHaveCount(2);

  await page.getByLabel("Search cards").fill(String(stamp));
  await expect(cards).toHaveCount(1);
  await expect(page.getByText("Showing 1 of 2 cards")).toBeVisible();

  await page.getByLabel("Search cards").fill("");
  await page.getByLabel("Filter by label").selectOption(label);
  await expect(cards).toHaveCount(1);

  // Dragging works while other cards are hidden.
  const heading = page.getByRole("heading", { name: title });
  const from = (await heading.boundingBox())!;
  const target = (await columns.nth(2).boundingBox())!;
  const saved = page.waitForResponse((response) => response.url().endsWith("/move"));
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, from.y + from.height / 2, { steps: 12 });
  await page.mouse.up();
  await saved;
  await expect(columns.nth(2).getByText(title)).toBeVisible();

  // dnd-kit swallows clicks for 50 ms after a pointer drop (so a drop is not also a click),
  // and the move can be saved faster than that; clearing is idempotent, so retry.
  await expect(async () => {
    await page.getByRole("button", { name: /clear filters/i }).click();
    await expect(cards).toHaveCount(2, { timeout: 500 });
  }).toPass();
  await page.reload();
  await expect(columns.nth(2).getByText(title)).toBeVisible();
  await deleteOpenBoard(page, boardName);
});
