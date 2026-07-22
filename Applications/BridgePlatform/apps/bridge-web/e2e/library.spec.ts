// The deal editor (2026-07-17, bridgebot-style grid): pick a seat, click
// cards to assign them, let "give the rest" finish the last hand, save, and
// land on the library entry. Plus the 2026-07-22 shelves: saving a play from
// a live board and resuming it, and saving a table lineup from the builder.
// (Runs after kb.spec — workers=1, alphabetical — so compiled KBs and
// players already exist for the table builder.)

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

test("save a play from a live board, then resume it from the library", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  const playName = `E2E resumable play ${Date.now().toString(36)}`;

  // Deal a watch-only board (no human seat) via the custom-table builder so
  // "step ▸" can step deterministically without ever hitting a human turn.
  await page.goto("/bridge/library/tables/new");
  await page.getByText("Set up a custom table").click();
  const block = page.locator("[data-kb-block]").first();
  const dealForm = block.locator("form").first();
  await dealForm.locator('input[name="seed"]').fill("7");
  await dealForm.getByRole("button", { name: "Deal a board" }).click();
  await page.waitForURL(/\/bridge\/table\/bs_/);

  // Three asked-for decisions (auto-play stays paused), then save as a play —
  // the recording stops at an AI seat, so the resumed board has work left.
  for (let n = 1; n <= 3; n++) {
    await page.getByRole("button", { name: "step ▸" }).click();
    await expect(page.getByText(`Decisions (${n})`)).toBeVisible({ timeout: 15_000 });
  }
  await page.locator('summary[aria-label="Save to library"]').click();
  await page.locator('select[name="kind"]').selectOption("play");
  await page.locator('input[name="name"]').fill(playName);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved to the library.")).toBeVisible();

  // Resume it from the plays shelf: a fresh session replays the recording.
  await page.goto("/bridge/library?kind=play");
  const row = page.locator("li").filter({ hasText: playName });
  await row.getByRole("button", { name: "Resume" }).click();
  await page.waitForURL(/\/bridge\/table\/bs_/);

  // The auction table carries the recorded calls…
  await expect(
    page.getByRole("cell", { name: /^(Pass|Dbl|Rdbl|[1-7](NT|[♠♥♦♣]))$/ }).first(),
  ).toBeVisible();
  // …and the board sits paused mid-play behind ▶ resume.
  await expect(page.getByRole("button", { name: "▶ resume" })).toBeVisible();
});

test("table builder: save a lineup to the library and see its entry", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  const lineupName = `E2E saved lineup ${Date.now().toString(36)}`;

  await page.goto("/bridge/library/tables/new");
  await page.getByText("Set up a custom table").click();
  const block = page.locator("[data-kb-block]").first();
  const dealForm = block.locator("form").first();
  await dealForm.locator('input[name="name"]').fill(lineupName);
  await dealForm.getByRole("button", { name: "Save lineup to library" }).click();
  await page.waitForURL(/\/bridge\/library\/le_/);

  await expect(page.getByRole("heading", { name: lineupName })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start · fresh deal" })).toBeVisible();
});
