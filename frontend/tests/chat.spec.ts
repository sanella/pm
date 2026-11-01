import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("a card created through the chat appears on the board without a reload", async ({ page }) => {
  await signIn(page);
  // The chat route is mocked: it returns the real board plus one new card in Done.
  const [first] = await (await page.request.get("/api/boards")).json();
  const board = await (await page.request.get(`/api/boards/${first.id}`)).json();
  const done = board.columns[4];
  done.cardIds.push("card-from-ai");
  board.cards["card-from-ai"] = {
    id: "card-from-ai",
    title: "Card from the AI",
    details: "",
    priority: "none",
    dueDate: null,
    labels: [],
    checklist: [],
  };
  await page.route(`**/api/boards/${first.id}/chat`, (route) =>
    route.fulfill({ json: { message: "I added the card.", board } })
  );

  await page.getByRole("button", { name: /ai assistant/i }).click();
  const sidebar = page.getByRole("complementary", { name: "AI assistant" });
  await sidebar.getByLabel("Message").fill("Add a card to Done");
  await sidebar.getByRole("button", { name: /send/i }).click();

  await expect(sidebar.getByText("I added the card.")).toBeVisible();
  await expect(
    page.getByTestId(`column-${done.id}`).getByText("Card from the AI")
  ).toBeVisible();
});
