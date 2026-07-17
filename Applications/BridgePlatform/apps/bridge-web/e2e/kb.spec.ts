// The KB workspace flow (Knowledge Rework Stage D): a fellow creates a KB,
// hand-authors items through the typed editor, builds a ladder pack, watches
// the capability checklist, edits a rule's range (auto-recompile), and works
// the suggestion queue. Extraction is exercised in unit tests (the live LLM
// needs a key); this spec covers everything around it through the real UI.

import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

const KB_NAME = `SAYC e2e ${Date.now().toString(36)}`;
let kbUrl = "";

test("fellow creates a knowledge base", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto("/bridge/kb");
  await page.getByLabel("Name").fill(KB_NAME);
  await page.getByLabel("System label").fill("SAYC");
  await page.getByRole("button", { name: "Create knowledge base" }).click();
  await expect(page.getByRole("heading", { name: KB_NAME })).toBeVisible();
  kbUrl = page.url();
});

test("hand-authors a fallback item and a 1NT agreement", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");

  // Fallback item via the typed editor.
  await page.goto(`${kbUrl}/items/new`);
  await page.getByLabel("Title").fill("Auction fallback: pass");
  await page
    .getByLabel("What a player reads (the agreement, in plain words)")
    .fill("With no agreement that applies, pass.");
  await page.getByLabel("Type").selectOption("fallback_rule");
  await page.getByRole("button", { name: "Create capability" }).click();
  await expect(page.getByRole("heading", { name: "Auction fallback: pass" })).toBeVisible();

  // 1NT agreement with an inline range setting, via typed rule fields.
  await page.goto(`${kbUrl}/items/new`);
  await page.getByLabel("Title").fill("1NT opening");
  await page
    .getByLabel("What a player reads (the agreement, in plain words)")
    .fill("Open 1NT with a balanced hand in the notrump range.");
  await page.getByLabel("Type").selectOption("agreement");
  await page.locator('input[name="rule0:label"]').fill("Open 1NT");
  await page.locator('select[name="rule0:role"]').selectOption("opening");
  await page.locator('input[name="rule0:hcpMin"]').fill("15");
  await page.locator('input[name="rule0:hcpMax"]').fill("17");
  await page.locator('select[name="rule0:balanced"]').selectOption("yes");
  await page.locator('select[name="rule0:actionType"]').selectOption("bid");
  await page.locator('input[name="rule0:actionLevel"]').fill("1");
  await page.locator('select[name="rule0:actionStrain"]').selectOption("N");
  await page.getByRole("button", { name: "Create capability" }).click();
  await expect(page.getByRole("heading", { name: "1NT opening" })).toBeVisible();

  // Both items listed; the KB compiled (health strip shows a live version).
  await page.goto(`${kbUrl}/items`);
  await expect(page.getByText("Auction fallback: pass")).toBeVisible();
  await expect(page.getByText("1NT opening")).toBeVisible();
  await expect(page.getByText(/draft compile/)).toBeVisible();
});

test("edits the 1NT range — the KB recompiles to a new version", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/items`);
  const before = await page.getByText(/draft compile/).textContent();

  await page.getByText("1NT opening").click();
  await page.locator('input[name="rule0:hcpMin"]').fill("14");
  await page.getByRole("button", { name: /Save \(recompiles/ }).click();
  await expect(page.getByText(/Saved — the knowledge base recompiled/)).toBeVisible();

  const after = await page.getByText(/draft compile/).textContent();
  expect(after).not.toBe(before);
});

test("builds a ladder pack and reads its capability coverage", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/ladder`);
  await page.getByLabel("Name").fill("Openings (incomplete)");
  await page.getByRole("checkbox", { name: /1NT opening/ }).check();
  await page.getByRole("checkbox", { name: /Auction fallback/ }).check();
  await page.getByRole("button", { name: "Save pack" }).click();

  await expect(page.getByRole("heading", { name: "Openings (incomplete)" })).toBeVisible();
  // Missing lead/play fallbacks and signals: the pack must read incomplete.
  await expect(page.getByText(/incomplete \(constrained play only\)/)).toBeVisible();
});

test("flags and resolves a suggestion", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/suggestions`);
  await page
    .getByLabel("What should someone look at?")
    .fill("The 1NT range needs checking against the booklet.");
  await page.getByRole("button", { name: "Flag" }).click();
  await expect(page.getByText("The 1NT range needs checking against the booklet.")).toBeVisible();

  await page.getByRole("button", { name: "Resolve" }).click();
  await page.getByText(/Resolved \(1\)/).click(); // expand the collapsed group
  await expect(page.getByText(/resolved by user_reviewer_rhea/)).toBeVisible();
});

test("broken JSON save keeps last-good serving and shows the banner", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/items`);
  await page.getByText("1NT opening").click();

  // Sabotage via the advanced payload box: reference an unknown setting.
  await page.getByText("Advanced: raw payload / settings JSON").click();
  await page
    .locator('textarea[name="payloadJson"]')
    .fill(
      JSON.stringify({
        kind: "auction_rules",
        rules: [
          {
            key: "open",
            label: "Broken",
            context: { role: "opening" },
            conditions: { hcp: { min: { $setting: "does_not_exist" } } },
            action: { type: "bid", level: 1, strain: "N" },
            priority: 10,
          },
        ],
      }),
    );
  await page.getByRole("button", { name: /Save \(recompiles/ }).click();

  await expect(page.getByText(/latest edit doesn't compile/)).toBeVisible();
  await expect(page.getByText(/does_not_exist/)).toBeVisible();
  await expect(page.getByText(/draft compile/)).toBeVisible(); // last-good still live

  // Repair via the typed fields — the banner clears and compiles resume.
  await page.locator('input[name="rule0:hcpMin"]').fill("15");
  await page.locator('input[name="rule0:hcpMax"]').fill("17");
  await page.getByRole("button", { name: /Save \(recompiles/ }).click();
  await expect(page.getByText(/Saved — the knowledge base recompiled/)).toBeVisible();
  await expect(page.getByText(/latest edit doesn't compile/)).not.toBeVisible();
});

test("wizard suggests minimal players; simulation counts floors honestly", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");

  // Give the KB a real ladder first: a complete floor pack.
  await page.goto(`${kbUrl}/items/new`);
  await page.getByLabel("Title").fill("Lead fallback: low from longest");
  await page
    .getByLabel("What a player reads (the agreement, in plain words)")
    .fill("With no lead agreement, lead low from your longest suit.");
  await page.getByLabel("Type").selectOption("fallback_rule");
  await page.getByText("Fallback behavior (fallback_rule items)").click();
  await page.locator('select[name="fb:phase"]').selectOption("opening_lead");
  await page.getByRole("button", { name: "Create capability" }).click();

  await page.goto(`${kbUrl}/items/new`);
  await page.getByLabel("Title").fill("Play fallback: lowest legal card");
  await page
    .getByLabel("What a player reads (the agreement, in plain words)")
    .fill("With no technique that applies, play your lowest legal card.");
  await page.getByLabel("Type").selectOption("fallback_rule");
  await page.getByText("Fallback behavior (fallback_rule items)").click();
  await page.locator('select[name="fb:phase"]').selectOption("card_play");
  await page.getByRole("button", { name: "Create capability" }).click();

  await page.goto(`${kbUrl}/items/new`);
  await page.getByLabel("Title").fill("No signals");
  await page
    .getByLabel("What a player reads (the agreement, in plain words)")
    .fill("This partnership plays no defensive signals.");
  await page.getByLabel("Type").selectOption("signal_agreement");
  await page.getByRole("button", { name: "Create capability" }).click();

  await page.goto(`${kbUrl}/ladder`);
  await page.getByLabel("Name").fill("Floor");
  await page.getByRole("checkbox", { name: /Auction fallback/ }).check();
  await page.getByRole("checkbox", { name: /Lead fallback/ }).check();
  await page.getByRole("checkbox", { name: /Play fallback/ }).check();
  await page.getByRole("checkbox", { name: /No signals/ }).check();
  await page.getByRole("button", { name: "Save pack" }).click();
  await expect(page.getByText("minimally complete on its own")).toBeVisible();

  // The wizard.
  await page.goto(`${kbUrl}/players`);
  await page.getByRole("button", { name: "Suggest minimal players" }).click();
  await expect(page.getByText(/Minimal complete — Floor/)).toBeVisible();
  await expect(page.getByText(/Minimal incomplete/)).toBeVisible();

  // Open the complete player: valid badge, simulate cleanly.
  await page.getByText(/Minimal complete — Floor/).click();
  await expect(page.getByText(/all 17 capabilities covered/)).toBeVisible();
  await page.getByRole("button", { name: "Run 24 seeded deals" }).click();
  await expect(page.getByText("24/24")).toBeVisible();
  const floors = page.locator("dd").filter({ hasText: /^0$/ });
  await expect(floors.first()).toBeVisible(); // zero engine-floor events

  // "Save as a new player" copies — the original is untouched and the copy
  // gets a distinguishable name.
  const beforeUrl = page.url();
  await page.getByRole("button", { name: "Save as a new player" }).click();
  await page.waitForURL((u) => /players\/pl_/.test(u.pathname) && u.href !== beforeUrl);
  await expect(
    page.getByRole("heading", { name: "Minimal complete — Floor (copy)" }),
  ).toBeVisible();
});

test("table: session pins, trace drawer, flag lands in the KB queue", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");

  // Deal a board via the custom-table setup: human South, Floor elsewhere.
  await page.goto("/bridge/table");
  await page.getByText("Set up a custom table").click();
  const block = page.locator('[data-kb-block^="SAYC e2e"]').last();
  const dealForm = block.locator("form").first();
  await dealForm.locator('select[name="humanSeat"]').selectOption("S");
  await dealForm.locator('input[name="seed"]').fill("7");
  for (const seat of ["N", "E", "W"]) {
    await dealForm
      .locator(`select[name="player:${seat}"]`)
      .selectOption({ label: "Minimal complete — Floor" });
  }
  await dealForm.getByRole("button", { name: "Deal a board" }).click();
  await page.waitForURL(/\/bridge\/table\/bs_/);

  // Dealer N, then E — the table auto-advances AI turns until South (us).
  await expect(page.getByText(/Decisions \(2\)/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Your call")).toBeVisible();
  const firstDecision = page.locator("details").filter({ hasText: "#0" }).last();
  await firstDecision.locator("summary").click();
  await expect(firstDecision.getByText(/fallback: pass/)).toBeVisible();

  // Flag it → the suggestion appears in the KB's queue with the session link.
  // Wait for the action POST to finish — navigating away aborts it otherwise.
  await firstDecision.locator('input[name="text"]').fill("Passing here looks wrong to me.");
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/bridge/table/"),
    ),
    firstDecision.getByRole("button", { name: "Flag" }).click(),
  ]);

  // We act as South: pass.
  await page.getByRole("button", { name: "Pass", exact: true }).click();

  await page.goto(`${kbUrl}/suggestions`);
  await expect(page.getByText("Passing here looks wrong to me.")).toBeVisible();
  await expect(page.getByText(/session bs_/)).toBeVisible();
});

test("constrained drill: an incomplete player never hits the engine floor", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");

  await page.goto("/bridge/table");
  await page.getByText("Set up a custom table").click();
  const block = page.locator('[data-kb-block^="SAYC e2e"]').last();
  const drillForm = block.locator("form").last();
  await drillForm
    .locator('select[name="playerId"]')
    .selectOption({ label: "Minimal incomplete — Openings (incomplete) (incomplete)" });
  await drillForm.locator('input[name="seed"]').fill("1");
  await drillForm.getByRole("button", { name: "Find a safe deal" }).click();
  await page.waitForURL(/\/bridge\/table\/bs_/, { timeout: 90_000 });

  await page.getByRole("button", { name: "play to end" }).click();
  await expect(page.getByText(/Passed out|made|down/).first()).toBeVisible({ timeout: 60_000 });

  // The verification panel proves the guarantee: zero engine-floor badges.
  await expect(page.getByText(/Decisions \(\d+\)/)).toBeVisible();
  await expect(page.getByText("engine floor")).toHaveCount(0);
});
