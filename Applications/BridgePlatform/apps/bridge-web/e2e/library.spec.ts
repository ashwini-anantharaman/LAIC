// The deal editor (2026-07-17): author a board suit by suit, let "take the
// rest" finish the last hand, save, and land on the library entry.

import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("deal editor: author a board and save it to the library", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto("/bridge/library/new");

  await page.getByPlaceholder("e.g. Weak 2 defense, board 4").fill("E2E authored board");
  const hands: [string, string][] = [
    ["North ♠", "AKQJ"],
    ["North ♥", "AKQ"],
    ["North ♦", "AKQ"],
    ["North ♣", "AKQ"],
    ["East ♠", "T98"],
    ["East ♥", "JT98"],
    ["East ♦", "JT9"],
    ["East ♣", "JT9"],
    ["South ♠", "7654"],
    ["South ♥", "765"],
    ["South ♦", "876"],
    ["South ♣", "876"],
  ];
  for (const [label, cards] of hands) await page.getByLabel(label).fill(cards);

  // Three hands are complete, so only West still offers "take the rest".
  await page.getByRole("button", { name: "take the rest" }).click();
  await expect(page.getByText("Every card is placed.")).toBeVisible();
  await expect(page.getByLabel("West ♦")).toHaveValue("5432");

  await page.getByRole("button", { name: "Save board" }).click();
  await page.waitForURL(/\/bridge\/library\/le_/);
  await expect(page.getByRole("heading", { name: "E2E authored board" })).toBeVisible();
  await expect(page.getByText(/authored · /)).toBeVisible();
});
