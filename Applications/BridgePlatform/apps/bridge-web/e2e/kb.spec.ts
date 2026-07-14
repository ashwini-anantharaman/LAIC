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
  await page.getByRole("button", { name: "Create item" }).click();
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
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("heading", { name: "1NT opening" })).toBeVisible();

  // Both items listed; the KB compiled (health strip shows a live version).
  await page.goto(`${kbUrl}/items`);
  await expect(page.getByText("Auction fallback: pass")).toBeVisible();
  await expect(page.getByText("1NT opening")).toBeVisible();
  await expect(page.getByText(/live compile/)).toBeVisible();
});

test("edits the 1NT range — the KB recompiles to a new version", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/items`);
  const before = await page.getByText(/live compile/).textContent();

  await page.getByText("1NT opening").click();
  await page.locator('input[name="rule0:hcpMin"]').fill("14");
  await page.getByRole("button", { name: /Save \(recompiles/ }).click();
  await expect(page.getByText(/Saved — the knowledge base recompiled/)).toBeVisible();

  const after = await page.getByText(/live compile/).textContent();
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
  await expect(page.getByText(/live compile/)).toBeVisible(); // last-good still live
});
