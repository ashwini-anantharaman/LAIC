// The deal editor (2026-07-17, bridgebot-style grid): pick a seat, click
// cards to assign them, let "give the rest" finish the last hand, save, and
// land on the library entry.

import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("deal editor: author a board on the card grid and save it", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto("/bridge/library/new");

  await page.getByPlaceholder("e.g. Weak 2 defense, board 4").fill("E2E authored board");

  // Assign 13 cards each to North, East, South by clicking the grid.
  const deal: [string, string[]][] = [
    ["North", ["♠A", "♠K", "♠Q", "♠J", "♥A", "♥K", "♥Q", "♦A", "♦K", "♦Q", "♣A", "♣K", "♣Q"]],
    ["East", ["♠10", "♠9", "♠8", "♥J", "♥10", "♥9", "♥8", "♦J", "♦10", "♦9", "♣J", "♣10", "♣9"]],
    ["South", ["♠7", "♠6", "♠5", "♠4", "♥7", "♥6", "♥5", "♦8", "♦7", "♦6", "♣8", "♣7", "♣6"]],
  ];
  for (const [seat, cards] of deal) {
    await page.getByRole("button", { name: seat, exact: false }).first().click();
    for (const card of cards) await page.getByRole("button", { name: card, exact: true }).click();
  }

  // West takes the pool.
  await page.getByRole("button", { name: /West/ }).first().click();
  await page.getByRole("button", { name: /give the rest to West/ }).click();
  await expect(page.getByText("Every card is placed.")).toBeVisible();

  await page.getByRole("button", { name: "Save board" }).click();
  await page.waitForURL(/\/bridge\/library\/le_/);
  await expect(page.getByRole("heading", { name: "E2E authored board" })).toBeVisible();
  await expect(page.getByText(/authored · /)).toBeVisible();
});
