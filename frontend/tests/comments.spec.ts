import { expect, test } from "@playwright/test";
import { createBoard, deleteOpenBoard, signIn } from "./helpers";

test("comment on a card and see it in the board activity", async ({ page }) => {
  const boardName = `Comments ${Date.now()}`;
  await signIn(page);
  await createBoard(page, boardName);
  const backlog = page.locator('[data-testid^="column-"]').first();
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Review copy");
  await backlog.getByRole("button", { name: /add card/i }).click();

  await page.getByRole("button", { name: "Details for Review copy" }).click();
  let dialog = page.getByRole("dialog", { name: "Review copy" });
  await expect(dialog.getByText("No comments yet.")).toBeVisible();
  await dialog.getByLabel("New comment").fill("Needs a second pass");
  await dialog.getByRole("button", { name: /add comment/i }).click();
  await expect(dialog.getByText("Needs a second pass")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Details for Review copy" }).click();
  dialog = page.getByRole("dialog", { name: "Review copy" });
  await expect(dialog.getByText("Needs a second pass")).toBeVisible();
  await dialog.getByRole("button", { name: "Delete comment: Needs a second pass" }).click();
  await expect(dialog.getByText("No comments yet.")).toBeVisible();
  await dialog.getByRole("button", { name: /close/i }).click();

  await page.getByRole("button", { name: /^activity$/i }).click();
  const activity = page.getByRole("dialog", { name: "Activity" }).getByRole("listitem");
  await expect(activity).toHaveText([/commented on "Review copy"/, /added card "Review copy" to "Backlog"/]);
  await page.getByRole("dialog", { name: "Activity" }).getByRole("button", { name: /close/i }).click();

  await deleteOpenBoard(page, boardName);
});

test("keep a checklist on a card", async ({ page }) => {
  const boardName = `Checklist ${Date.now()}`;
  await signIn(page);
  await createBoard(page, boardName);
  const backlog = page.locator('[data-testid^="column-"]').first();
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Launch prep");
  await backlog.getByRole("button", { name: /add card/i }).click();

  await page.getByRole("button", { name: "Details for Launch prep" }).click();
  let dialog = page.getByRole("dialog", { name: "Launch prep" });
  for (const item of ["Book venue", "Send invites"]) {
    await dialog.getByLabel("New checklist item").fill(item);
    await dialog.getByRole("button", { name: /add item/i }).click();
    await expect(dialog.getByLabel(item, { exact: true })).toBeVisible();
  }
  await dialog.getByLabel("Book venue", { exact: true }).check();
  await expect(dialog.getByRole("region", { name: "Checklist 1/2" })).toBeVisible();
  await dialog.getByRole("button", { name: /close/i }).click();

  const card = page.locator('[data-testid^="card-"]').filter({ hasText: "Launch prep" });
  await expect(card.getByText("Checklist 1/2")).toBeVisible();
  await page.reload();
  await expect(card.getByText("Checklist 1/2")).toBeVisible();

  await page.getByRole("button", { name: "Details for Launch prep" }).click();
  dialog = page.getByRole("dialog", { name: "Launch prep" });
  await expect(dialog.getByLabel("Book venue", { exact: true })).toBeChecked();
  await dialog.getByRole("button", { name: "Remove item: Send invites" }).click();
  await expect(dialog.getByRole("region", { name: "Checklist 1/1" })).toBeVisible();
  await dialog.getByRole("button", { name: /close/i }).click();

  await deleteOpenBoard(page, boardName);
});
