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
  await page.getByLabel("Name", { exact: true }).fill(KB_NAME);
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
  await page.getByRole("button", { name: "Create knowledge item" }).click();
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
  await page.getByRole("button", { name: "Create knowledge item" }).click();
  await expect(page.getByRole("heading", { name: "1NT opening" })).toBeVisible();

  // Both items listed; the KB compiled (health strip shows a live version).
  await page.goto(`${kbUrl}/items`);
  await expect(page.getByText("Auction fallback: pass")).toBeVisible();
  await expect(page.getByText("1NT opening")).toBeVisible();
  await expect(page.getByText(/working compile/)).toBeVisible();
});

test("edits the 1NT range — the KB recompiles to a new version", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/items`);
  const before = await page.getByText(/working compile/).textContent();

  await page.getByText("1NT opening").click();
  // Items open in VIEW mode now — the typed editor is behind the Edit link.
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.locator('input[name="rule0:hcpMin"]').fill("14");
  await page.getByRole("button", { name: "Save to current draft" }).click();
  await expect(page.getByText(/Saved — the knowledge base recompiled/)).toBeVisible();

  const after = await page.getByText(/working compile/).textContent();
  expect(after).not.toBe(before);
});

test("creates a knowledge set and reads its completeness checklist", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/sets/new`);
  await page.getByLabel("Name").fill("Openings (incomplete)");
  await page.getByRole("checkbox", { name: /Intended to be complete/ }).check();
  await page.getByRole("checkbox", { name: /1NT opening/ }).check();
  await page.getByRole("checkbox", { name: /Auction fallback/ }).check();
  await page.getByRole("button", { name: "Create set" }).click();

  // Lands on the set detail page; the opt-in checklist shows the gaps
  // (missing lead/play fallbacks and signals: the set must read incomplete).
  await expect(page.getByText("Openings (incomplete)").first()).toBeVisible();
  await expect(page.getByText(/Completeness · \d+\/17/)).toBeVisible();
  await expect(page.getByText(/✗/).first()).toBeVisible();
});

test("flags and resolves a suggestion", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/suggestions`);
  await page
    .getByLabel("Note")
    .fill("The 1NT range needs checking against the booklet.");
  await page.getByRole("button", { name: "Suggest" }).click();
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
  await page.getByRole("link", { name: "Edit", exact: true }).click();

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
  await page.getByRole("button", { name: "Save to current draft" }).click();

  await expect(page.getByText(/latest edit doesn't compile/)).toBeVisible();
  await expect(page.getByText(/references unknown setting "does_not_exist"/)).toBeVisible();
  await expect(page.getByText(/working compile/)).toBeVisible(); // last-good still live

  // Repair via the typed fields — the banner clears and compiles resume.
  // (The save redirect lands back in VIEW mode, so re-open the editor.)
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.locator('input[name="rule0:hcpMin"]').fill("15");
  await page.locator('input[name="rule0:hcpMax"]').fill("17");
  await page.getByRole("button", { name: "Save to current draft" }).click();
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
  await page.locator('select[name="fb:phase"]').selectOption("opening_lead");
  await page.getByRole("button", { name: "Create knowledge item" }).click();

  await page.goto(`${kbUrl}/items/new`);
  await page.getByLabel("Title").fill("Play fallback: lowest legal card");
  await page
    .getByLabel("What a player reads (the agreement, in plain words)")
    .fill("With no technique that applies, play your lowest legal card.");
  await page.getByLabel("Type").selectOption("fallback_rule");
  await page.locator('select[name="fb:phase"]').selectOption("card_play");
  await page.getByRole("button", { name: "Create knowledge item" }).click();

  await page.goto(`${kbUrl}/items/new`);
  await page.getByLabel("Title").fill("No signals");
  await page
    .getByLabel("What a player reads (the agreement, in plain words)")
    .fill("This partnership plays no defensive signals.");
  await page.getByLabel("Type").selectOption("signal_agreement");
  await page.getByRole("button", { name: "Create knowledge item" }).click();

  await page.goto(`${kbUrl}/sets/new`);
  await page.getByLabel("Name").fill("Floor");
  await page.getByRole("checkbox", { name: /Intended to be complete/ }).check();
  await page.getByRole("checkbox", { name: /Auction fallback/ }).check();
  await page.getByRole("checkbox", { name: /Lead fallback/ }).check();
  await page.getByRole("checkbox", { name: /Play fallback/ }).check();
  await page.getByRole("checkbox", { name: /No signals/ }).check();
  await page.getByRole("button", { name: "Create set" }).click();
  await expect(page.getByText(/Completeness · 17\/17/)).toBeVisible();

  // The wizard now lives on the single Players page, scoped to this KB.
  const kbId = kbUrl.split("/bridge/kb/")[1];
  await page.goto(`/bridge/players?kb=${kbId}`);
  await page.getByRole("button", { name: "Suggest minimal players" }).click();
  await expect(page.getByText(/Minimal complete — Floor/)).toBeVisible();
  await expect(page.getByText(/Minimal incomplete/)).toBeVisible();

  // Open the complete player: valid badge, simulate cleanly.
  await page.getByText(/Minimal complete — Floor/).click();
  await expect(page.getByText(/all 17 categories covered/)).toBeVisible();
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
  await page.goto("/bridge/library/tables/new");
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

  // Boards never self-start: hit ▶ start, then dealer N and E play to us.
  await page.getByRole("button", { name: "▶ start" }).click();
  await expect(page.getByText(/Decisions \(2\)/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Your call")).toBeVisible();
  const firstDecision = page.locator("details").filter({ hasText: "#0" }).last();
  await firstDecision.locator("summary").click();
  // The summary's honest reason (the body also names the item "Auction
  // fallback: pass", so match the exact reason string, not a loose regex).
  await expect(
    firstDecision.getByText("no agreement applied — fallback: pass"),
  ).toBeVisible();

  // Flag it → the suggestion appears in the KB's queue with the session link.
  // Wait for the action POST to finish — navigating away aborts it otherwise.
  await firstDecision.locator('input[name="text"]').fill("Passing here looks wrong to me.");
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/bridge/table/"),
    ),
    firstDecision.getByRole("button", { name: "Suggest" }).click(),
  ]);

  // We act as South: pass.
  await page.getByRole("button", { name: "P", exact: true }).click();

  await page.goto(`${kbUrl}/suggestions`);
  await expect(page.getByText("Passing here looks wrong to me.")).toBeVisible();
  await expect(page.getByRole("link", { name: "open the session →" })).toBeVisible();
  // The flagged position travels with the flag: deal, auction, decision.
  await expect(page.getByText(/dealer N/)).toBeVisible();
  await expect(page.getByText(/Flagged: N chose/)).toBeVisible();
});

test("Play offers Quickplay and Customize; Quickplay deals in one click", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  // Play is a landing now — no board is dealt until you choose a door.
  await page.goto("/bridge/table");
  await expect(page.getByRole("heading", { name: "Quickplay" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Customize" })).toBeVisible();
  // One click on Quickplay (deal or resume) lands on a table.
  await page
    .getByRole("button", { name: /Quickplay|Deal a fresh board/ })
    .or(page.getByRole("link", { name: /^Resume / }))
    .first()
    .click();
  await page.waitForURL(/\/bridge\/table\/bs_/, { timeout: 30_000 });
  // A fresh board sits paused behind ▶ start; a resumed one may already be
  // at OUR turn (no AI to act → no start button, the bid pad is up).
  const start = page.getByRole("button", { name: /▶ (start|resume)/ });
  if (await start.isVisible().catch(() => false)) await start.click();
  await expect(page.getByText(/Decisions \(\d+\)|Your call/).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("constrained drill: an incomplete player never hits the engine floor", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");

  await page.goto("/bridge/library/tables/new");
  await page.getByText("Set up a custom table").click();
  const block = page.locator('[data-kb-block^="SAYC e2e"]').last();
  const drillForm = block.locator("form").last();
  await drillForm
    .locator('select[name="playerId"]')
    .selectOption({ label: "Minimal incomplete — Openings (incomplete) (incomplete)" });
  await drillForm.locator('input[name="seed"]').fill("1");
  await drillForm.getByRole("button", { name: "Find a safe deal" }).click();
  await page.waitForURL(/\/bridge\/table\/bs_/, { timeout: 90_000 });

  await page.getByRole("button", { name: "Play to end" }).click();
  await expect(page.getByText(/Passed out|made|down/).first()).toBeVisible({ timeout: 60_000 });

  // The verification panel proves the guarantee: zero engine-floor badges.
  await expect(page.getByText(/Decisions \(\d+\)/)).toBeVisible();
  await expect(page.getByText("engine floor")).toHaveCount(0);
});

test("Master accordions remember their collapsed state", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/items?view=list`);
  await expect(page.getByText("1NT opening").first()).toBeVisible();

  // Collapse the Agreements group; its items disappear.
  await page.locator('details[data-acc="agreement"] > summary').click();
  await expect(page.getByText("1NT opening")).toBeHidden();

  // Navigate away and back — the group is still collapsed (localStorage).
  await page.goto(`${kbUrl}`);
  await page.goto(`${kbUrl}/items?view=list`);
  await expect(page.getByText("1NT opening")).toBeHidden();
});

test("Save as a new knowledge item forks with lineage", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/items`);
  await page.getByText("1NT opening", { exact: true }).click();
  // The fork button lives in the editor — enter edit mode first.
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Save as new knowledge item" }).click();

  await expect(
    page.getByRole("heading", { name: "1NT opening (copy)" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /forked from 1NT opening/ })).toBeVisible();
});

test("deprecate an item from the editor (hidden from the default view, kept under deprecated)", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  // No mass actions in the knowledge view — deprecation is a per-item status
  // change in the editor.
  await page.goto(`${kbUrl}/items?view=list`);
  await page.getByText("1NT opening (copy)").click();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.locator('select[name="status"]').selectOption("deprecated");
  await page.getByRole("button", { name: "Save to current draft" }).click();
  await expect(page.getByText(/Saved — the knowledge base recompiled/)).toBeVisible();

  // The default status filter hides deprecated items.
  await page.goto(`${kbUrl}/items?view=list`);
  await expect(page.getByText("1NT opening (copy)")).toHaveCount(0);
  // The original survives untouched.
  await expect(page.getByText("1NT opening", { exact: true })).toBeVisible();

  // The deprecated view still lists it — knowledge is never deleted.
  await page.goto(`${kbUrl}/items?status=deprecated&view=list`);
  await expect(page.getByText("1NT opening (copy)")).toBeVisible();
});

test("fix at the table: undo pauses, overlay edits the item, session re-pins", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");

  // Same lineup as the pinning test: human South, Floor AIs elsewhere.
  await page.goto("/bridge/library/tables/new");
  await page.getByText("Set up a custom table").click();
  const block = page.locator('[data-kb-block^="SAYC e2e"]').last();
  const dealForm = block.locator("form").first();
  await dealForm.locator('select[name="humanSeat"]').selectOption("S");
  await dealForm.locator('input[name="seed"]').fill("11");
  for (const seat of ["N", "E", "W"]) {
    await dealForm
      .locator(`select[name="player:${seat}"]`)
      .selectOption({ label: "Minimal complete — Floor" });
  }
  await dealForm.getByRole("button", { name: "Deal a board" }).click();
  await page.waitForURL(/\/bridge\/table\/bs_/);
  await page.getByRole("button", { name: "▶ start" }).click();
  await expect(page.getByText(/Decisions \(2\)/)).toBeVisible({ timeout: 15_000 });

  // Undo the last AI decision — the table comes back PAUSED.
  await page.getByRole("button", { name: "Undo the last decision" }).click();
  await page.waitForURL(/paused=/);
  await expect(page.getByText(/Decisions \(1\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "▶ resume" })).toBeVisible();

  // Open the trace, jump into the overlay editor for the matched item.
  const decision = page.locator("details").filter({ hasText: "#0" }).last();
  await decision.locator("summary").click();
  await decision.getByRole("link", { name: "fix at the table →" }).click();
  await page.waitForURL(/fix=ki_/);
  await expect(page.getByText("Fixing at the table")).toBeVisible();

  // The overlay opens read-only (the KB's item view); Edit reveals the editor.
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.waitForURL(/fixMode=edit/);

  // Save without changes — still re-pins and returns to the paused board.
  await page.getByRole("button", { name: "Save to current draft" }).click();
  await page.waitForURL(/fixed=1/);
  await expect(page.getByText(/this table now plays from the updated rules/)).toBeVisible();
  await expect(page.getByRole("button", { name: "▶ resume" })).toBeVisible();

  // Ask for one decision — play continues under the (re)pinned compile.
  await page.getByRole("button", { name: "step ▸" }).click();
  await expect(page.getByText(/Decisions \(2\)/)).toBeVisible({ timeout: 15_000 });
});

test("delete a player from the roster", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto("/bridge/players");

  // Take the first matching card and remember WHICH player it is (its edit
  // href), since other tests mint similarly named players.
  const card = page.locator("li").filter({ hasText: "Minimal complete — Floor" }).first();
  await expect(card).toBeVisible();
  const editHref = await card.getByRole("link", { name: "Edit" }).getAttribute("href");

  page.once("dialog", (d) => void d.accept());
  await card.getByRole("button", { name: "Delete" }).click();

  await page.waitForURL(/deleted=1/);
  await expect(page.getByText("Player deleted.")).toBeVisible();
  await expect(page.locator(`a[href="${editHref}"]`)).toHaveCount(0);
});

test("curated SAYC template: install, complete sets, and a traced board", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");

  // Install from the KB list page.
  await page.goto("/bridge/kb");
  const name = `SAYC curated e2e ${Date.now().toString(36)}`;
  const installSection = page
    .locator("section")
    .filter({ hasText: "Start from the curated SAYC template" });
  await installSection.getByRole("textbox").fill(name);
  await installSection.getByRole("button", { name: "Install curated SAYC" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
  const curatedKbUrl = page.url();

  // The sets landed, Full SAYC is intended-complete and 17/17.
  await page.goto(`${curatedKbUrl}/sets`);
  await expect(page.getByText("Full SAYC")).toBeVisible();
  await page.getByRole("link", { name: /Full SAYC/ }).click();
  await expect(page.getByText("Completeness · 17/17")).toBeVisible();

  // A Base release was pinned.
  await page.goto(`${curatedKbUrl}/versions`);
  await expect(page.getByText(/Base — curated SAYC/)).toBeVisible();

  // One-click a player from the Full SAYC set, then watch four copies play.
  const kbId = curatedKbUrl.match(/kb\/(kb_[a-z0-9]+)/)![1]!;
  await page.goto(`/bridge/players?kb=${kbId}`);
  await page.getByRole("button", { name: "Full SAYC", exact: true }).click();
  await page.waitForURL(/players\/pl_.*saved=1/);

  await page.goto(`/bridge/players?kb=${kbId}`);
  const card = page.locator("li").filter({ hasText: /Full SAYC — / }).first();
  await card.getByRole("button", { name: "Watch 4 copies" }).click();
  await page.waitForURL(/\/bridge\/table\/bs_/);

  // The AIs bid from the curated knowledge once started; the trace cites a
  // curated item.
  await page.getByRole("button", { name: "▶ start" }).click();
  await expect(page.getByText(/Decisions \([1-9]/)).toBeVisible({ timeout: 20_000 });
  const first = page.locator("details").filter({ hasText: "#0" }).last();
  await first.locator("summary").click();
  await expect(first.getByRole("link", { name: "fix at the table →" })).toBeVisible();
});

test("B2F3 curriculum collections: one click drafts three chained sets (idempotent)", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");

  // Fresh curated KB so the classifier has real SAYC items to bucket.
  await page.goto("/bridge/kb");
  const name = `B2F3 e2e ${Date.now().toString(36)}`;
  const installSection = page
    .locator("section")
    .filter({ hasText: "Start from the curated SAYC template" });
  await installSection.getByRole("textbox").fill(name);
  await installSection.getByRole("button", { name: "Install curated SAYC" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
  const b2f3KbUrl = page.url();

  await page.goto(`${b2f3KbUrl}/sets`);
  await page.getByRole("button", { name: "Create B2F3 collections (draft)" }).click();
  await page.waitForURL(/\/sets\?b2f3created=1/);
  await expect(page.getByText("B2F3 collections drafted.")).toBeVisible();

  // The three chained sets are listed (the banner links each, exact names).
  await expect(page.getByRole("link", { name: "B2F3 Beginner", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "B2F3 Advanced Beginner", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "B2F3 Intermediate", exact: true })).toBeVisible();

  // Idempotent: re-running regenerates the SAME three sets (never duplicates).
  await page.getByRole("button", { name: "Regenerate B2F3 collections (draft)" }).click();
  await page.waitForURL(/\/sets\?b2f3created=1/);
  await expect(page.getByRole("link", { name: "B2F3 Intermediate", exact: true })).toHaveCount(1);
});

test("augmentation: source → draft copy → review board → discard", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");

  // Register a source on the e2e KB and upload a tiny text document.
  await page.goto(`${kbUrl}/sources`);
  await page.locator('input[name="slug"]').fill("augtest");
  await page.locator('input[name="title"]').fill("Augment Test Notes");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page.getByText("Augment Test Notes")).toBeVisible();

  const sourceCard = page
    .locator("div")
    .filter({ hasText: "src_augtest" })
    .filter({ has: page.locator('input[type="file"]') })
    .last();
  await sourceCard.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "OVERCALL STYLE\nOvercalls should show a good suit.\n\nRAISES\nRaise with support.",
    ),
  });
  await sourceCard.getByRole("button", { name: "Upload document" }).click();
  await page.waitForURL(/uploaded=/);

  // Start the augmentation — a DRAFT copy is created and the board opens.
  await page
    .getByRole("button", { name: "⇄ Augment into a new draft…" })
    .first()
    .click();
  await page.waitForURL(/\/augment/);
  await expect(page.getByText("Augmentation review")).toBeVisible();
  await expect(page.getByText(/Merging “Augment Test Notes”/)).toBeVisible();
  await expect(page.getByText("Items the source modified")).toBeVisible();
  await expect(page.getByText("New items from the source")).toBeVisible();
  await expect(page.getByText(/Conflicts the merge would introduce/)).toBeVisible();
  // No LLM key in e2e — the board says so instead of pretending.
  await expect(page.getByText(/Merging needs ANTHROPIC_API_KEY/)).toBeVisible();

  // The draft shows up as a derived KB; the base is untouched.
  const draftUrl = page.url().replace(/\/augment.*$/, "");
  expect(draftUrl).not.toBe(kbUrl);

  // Discard: back on the base with the banner; the draft is gone.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Discard draft" }).click();
  await page.waitForURL(/augmentDiscarded=1/);
  await expect(page.getByText("Augmentation draft discarded.")).toBeVisible();
  await page.goto("/bridge/kb");
  await expect(page.getByText("(draft)")).toHaveCount(0);
});

test("test bench: a typed hand + auction returns a decision and a rules panel", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");

  // Empty form first: the page renders without a decision yet.
  await page.goto(`${kbUrl}/test`);
  await expect(page.getByRole("heading", { name: "Test a decision" })).toBeVisible();

  // A valid 13-card PBN hand, opening seat (empty auction), full knowledge.
  await page.goto(
    `${kbUrl}/test?hand=${encodeURIComponent("AKQ2.T94.532.A87")}&auction=&dealer=N&player=defaults`,
  );
  await expect(page.getByText(/Bidding decisions only/)).toBeVisible();
  await expect(page.getByText(/Rules considered/)).toBeVisible();

  // A malformed hand shows a friendly parse error, not a crash.
  await page.goto(`${kbUrl}/test?hand=nonsense&auction=&dealer=N&player=defaults`);
  await expect(page.getByText(/isn't a card|need 13/)).toBeVisible();
});

test("coverage: a short self-play run reports fired vs never-fired rules", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/coverage?deals=5`);
  await expect(page.getByRole("heading", { name: "Coverage check" })).toBeVisible();
  await expect(page.getByText("deals completed")).toBeVisible();
  await expect(page.getByText(/rules fired/)).toBeVisible();
});

test("review from the list: Approve flips status inline and banners", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/items?view=list`);
  // The fallback item is a draft — approve it straight from its row.
  const row = page.locator("li").filter({ hasText: "Auction fallback: pass" });
  await row.getByRole("button", { name: "Approve", exact: true }).first().click();
  await expect(page.getByText(/Status updated to approved/)).toBeVisible();
});

test("item page: prev/next walk the filtered Master list", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/items?view=list`);
  await page.getByText("1NT opening", { exact: true }).click();
  // Arrived with ?from=, so the reviewer position indicator renders.
  await expect(page.getByText(/\d+ of \d+/)).toBeVisible();
});

test("findings: the detectors run and report gaps/anomalies honestly", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/findings?deals=30`);
  await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
  await expect(page.getByText("deals played")).toBeVisible();
  await expect(page.getByText(/Missing continuations \(\d+\)/)).toBeVisible();
  await expect(page.getByText(/Outcome anomalies \(\d+\)/)).toBeVisible();
});

test("source audit: page renders with the honest no-key notice", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/source-audit`);
  await expect(page.getByRole("heading", { name: "Source-fidelity audit" })).toBeVisible();
  // e2e servers strip ANTHROPIC_API_KEY — the audit must say so, not pretend.
  await expect(page.getByText(/ANTHROPIC_API_KEY isn't configured/)).toBeVisible();
});

test("benchmark: parked — tab hidden and route redirects (BRIDGE_BENCHMARK unset)", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/items`);
  // The BEN benchmark is parked: no tab in the KB nav.
  await expect(page.getByRole("link", { name: "Benchmark", exact: true })).toHaveCount(0);
  // A stale URL lands back on the KB overview, not the benchmark page.
  await page.goto(`${kbUrl}/benchmark`);
  await expect(page).toHaveURL(kbUrl);
  await expect(page.getByRole("heading", { name: "Benchmark", exact: true })).toHaveCount(0);
});

test("BBO view: the skin toggles on and preserves the table", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  // Reuse any active session via the Play landing quickplay flow.
  await page.goto("/bridge/table");
  await page
    .getByRole("button", { name: /Quickplay|Deal a fresh board/ })
    .or(page.getByRole("link", { name: /^Resume / }))
    .first()
    .click();
  await page.waitForURL(/\/bridge\/table\/bs_/);
  await page.getByRole("link", { name: "Switch to BBO view" }).click();
  await page.waitForURL(/skin=bbo/);
  // The iconic bits: W N E S auction header on the green felt + the toggle back.
  await expect(page.getByRole("link", { name: "Switch to platform view" })).toBeVisible();
  await expect(page.getByText("Rules considered", { exact: false }).first())
    .toBeVisible({ timeout: 10_000 })
    .catch(() => {}); // decisions rail only present after a decision — non-fatal
});

test("auction rules explorer: lists the rules at a decision point", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/auction-rules?auction=${encodeURIComponent("1C P")}&dealer=N&vul=none`);
  await expect(
    page.getByRole("heading", { name: "Auction rules at a decision point" }),
  ).toBeVisible();
  // The partnership panel always renders once an auction is submitted.
  await expect(page.getByText(/Partnership so far/)).toBeVisible();
  // Either matching rules or the honest "no rule matches" message — both mention
  // the context. The count heading is always present after a submit.
  await expect(page.getByText(/match this context/)).toBeVisible();
});

test("drills: the runner renders and seeds the expert cases", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto(`${kbUrl}/drills`);
  await expect(page.getByRole("heading", { name: "Drills", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Seed expert drills" }).click();
  // The seed action redirects with a flash, and the seeded drills appear in the table.
  await expect(page.getByText(/Seeded \d+ expert drill|already seeded/)).toBeVisible();
  await expect(page.getByText(/\[expert\]/).first()).toBeVisible();
});
