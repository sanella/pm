import { expect, test, type Browser, type Page } from "@playwright/test";
import { createBoard } from "./helpers";

const register = async (browser: Browser, username: string) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("secret-pass");
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
  return page;
};

const deleteAccount = async (page: Page) => {
  await page.getByRole("button", { name: /^account$/i }).click();
  await page.getByLabel("Password to confirm deletion").fill("secret-pass");
  await page.getByRole("button", { name: /delete account/i }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
};

test("share a board, work on it together, and leave it", async ({ browser }) => {
  const stamp = Date.now();
  const ownerName = `e2e_owner_${stamp}`;
  const memberName = `e2e_member_${stamp}`;
  const boardName = `Shared ${stamp}`;
  const owner = await register(browser, ownerName);
  const member = await register(browser, memberName);

  await createBoard(owner, boardName);
  await owner.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = owner.getByRole("dialog", { name: `Share ${boardName}` });
  await dialog.getByLabel("Username to add").fill(memberName);
  await dialog.getByRole("button", { name: /add member/i }).click();
  await expect(dialog.getByRole("button", { name: `Remove ${memberName}` })).toBeVisible();
  await dialog.getByRole("button", { name: /close/i }).click();

  // The member sees the board marked with its owner, without owner-only actions.
  await member.reload();
  const sharedButton = member.getByRole("button", { name: `${boardName} · ${ownerName}` });
  await sharedButton.click();
  await expect(sharedButton).toHaveAttribute("aria-current", "page");
  await expect(member.getByRole("button", { name: /rename board/i })).toHaveCount(0);
  const backlog = member.locator('[data-testid^="column-"]').first();
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Added by the member");
  await backlog.getByRole("button", { name: /add card/i }).click();
  await expect(backlog.getByText("Added by the member")).toBeVisible();

  await owner.reload();
  await expect(owner.getByText("Added by the member")).toBeVisible();

  await member.getByRole("button", { name: "Share", exact: true }).click();
  await member.getByRole("button", { name: /leave board/i }).click();
  await expect(sharedButton).toHaveCount(0);

  await deleteAccount(member);
  await deleteAccount(owner);
});
