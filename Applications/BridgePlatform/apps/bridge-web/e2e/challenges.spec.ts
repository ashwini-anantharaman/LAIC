// Challenges v1 (docs/challenges-v1-spec.md + ADDENDUM A): the list, the create
// wizard, invites, and the results gate.
//
// ── WHAT THIS SPEC DELIBERATELY DOES NOT COVER ──────────────────────────────
// BEN_ENDPOINT is unset in dev and CI, and challenge play correctly REFUSES to
// start without it (spec §2: BEN everywhere, no KB fallback — a one-attempt
// scored board must never be played against the shelved house player). That
// refusal is asserted below, and it is not stubbed away: nothing here fakes a
// BEN service into the app. So everything downstream of "a board actually
// starts" is out of reach here and is covered by unit tests + manual runs
// against a live BEN instead:
//
//   · playing a board — session creation, the seat plan, the decision cache
//     (lib/challengeBen.test.ts), the one-attempt/resume rule, the freeze;
//   · the in-table challenge chrome — the strip, `Board k of N`, the Results
//     button's visibility rule, the standings overlay over the felt (A4;
//     packages/bridge-table-ui/src/challengeComponents.test.ts);
//   · "BEN is thinking… / retry" — only reachable when a BEN call fails;
//   · comparisons and baselines — full-BEN, your-contract, from-this-point;
//   · the scored leaderboard and board-by-board grid with real figures
//     (resultsView.test.ts covers the arithmetic);
//   · "Replay for practice (unscored)" — it is gated on having FINISHED every
//     board, which cannot happen without BEN.
//
// State: this spec sorts SECOND (after access.spec, which leaves the catalogue
// at defaults) and shares the JSON stores with every later spec, so the one
// test that edits the access catalogue puts it back — afterAll resets it even
// when a test fails. It needs no compiled KB, so it is safe ahead of kb.spec.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

const PHONE = { width: 390, height: 844 };

const CREATOR = "user_coach_carlos";
const INVITEE = "user_learner_lena";
const INVITEE_NAME = "Lena Novak";
const MODERATOR_NAME = "Paul Osei";

/** Titles are shared across the serial tests below. */
const IMPS_TITLE = "E2E spoiler-safe challenge";
const ALWAYS_TITLE = "E2E live-standings challenge";

/** Sign a fresh cookie in (each block clears the prior dev user first). */
async function switchUser(context: BrowserContext, devUserId: string): Promise<void> {
  await context.clearCookies();
  await signInAs(context, devUserId);
}

/** Reset the catalogue to defaults as an editor — accepts the confirm dialog. */
async function resetCatalogue(page: Page): Promise<void> {
  await switchUser(page.context(), "user_orgadmin_olivia");
  await page.goto("/bridge/teams");
  const reset = page.getByRole("button", { name: "Reset to defaults" });
  if (await reset.count()) {
    page.once("dialog", (d) => d.accept());
    await reset.click();
    await expect(page.getByText("Access catalogue reset")).toBeVisible();
  }
}

/** The list card for a challenge, by title — a Link only once it is accepted. */
function cardLink(page: Page, title: string) {
  return page.locator('a[href*="/bridge/challenges/chl_"]').filter({ hasText: title });
}

/** The challenge id behind a list card (its href is the entry route). */
async function idOfCard(page: Page, title: string): Promise<string> {
  const href = await cardLink(page, title).first().getAttribute("href");
  return /chl_[a-z0-9]+/.exec(href ?? "")![0];
}

/** How wide the document is beyond its viewport — 0 on a page that behaves. */
async function overflowPx(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * Drive the create wizard end to end and return the new challenge's id. Board
 * count starts at 6, so `boards` is reached with the − stepper.
 */
async function createChallenge(
  page: Page,
  opts: Readonly<{
    title: string;
    boards: number;
    scoring?: "IMPs" | "Matchpoints" | "Total points";
    standingsAlways?: boolean;
    invite?: readonly { name: string; moderator?: boolean }[];
  }>,
): Promise<string> {
  await page.goto("/bridge/challenges/new");
  await page.getByLabel("Title").fill(opts.title);

  if (opts.scoring)
    await page.getByRole("button", { name: opts.scoring, exact: true }).click();

  // Quick create and 01 · Basics drive the same board count — either stepper
  // does; first() is Quick create's.
  const fewer = page.getByRole("button", { name: "One board fewer" }).first();
  for (let n = 6; n > opts.boards; n--) await fewer.click();

  if (opts.standingsAlways)
    await page.getByRole("button", { name: /Always visible/ }).click();

  for (const person of opts.invite ?? []) {
    await page.getByPlaceholder("Search players by name").fill(person.name);
    await page.getByRole("button", { name: "Invite", exact: true }).first().click();
    if (person.moderator) {
      // The creator's own row is first and permanently checked+disabled, so the
      // enabled boxes are the invitees' in the order they were added.
      const boxes = page.getByRole("checkbox", { name: "Moderator" });
      await boxes.nth((opts.invite ?? []).indexOf(person) + 1).check();
    }
  }

  // Every Create button on the page submits the same draft — Quick create's,
  // 05 · Review's, the sticky phone bar's, the wide draft rail's. first() is
  // Quick create's.
  await page.getByRole("button", { name: "Create challenge" }).first().click();
  await page.waitForURL(/\/bridge\/challenges\?created=/);
  return idOfCard(page, opts.title);
}

let impsId = "";
let alwaysId = "";

test.describe("challenges", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await resetCatalogue(page);
    } finally {
      await page.close();
    }
  });

  test("the Challenges nav entry opens the list for a permitted user", async ({
    page,
    context,
  }) => {
    await switchUser(context, CREATOR);
    await page.goto("/bridge/home");
    await page.getByRole("link", { name: "Challenges" }).first().click();
    await page.waitForURL(/\/bridge\/challenges$/);

    await expect(page.getByRole("heading", { name: "Challenges" })).toBeVisible();
    // challenge.create is ALL by default, so the create door is on the page.
    await expect(page.getByRole("link", { name: /New challenge|Create a challenge/ }).first()).toBeVisible();
  });

  test("a role denied page.challenges loses the nav entry and gets a 404", async ({
    page,
    context,
  }) => {
    await switchUser(context, "user_orgadmin_olivia");
    await page.goto("/bridge/teams");
    await page.locator('input[name="page.challenges::bridge_learner"]').uncheck();
    await page.getByRole("button", { name: "Save catalogue" }).click();
    await expect(page.getByText("Access catalogue saved")).toBeVisible();

    await switchUser(context, INVITEE);
    await page.goto("/bridge/home");
    await expect(page.getByRole("link", { name: "Challenges" })).toHaveCount(0);
    await page.goto("/bridge/challenges");
    await expect(page.getByRole("heading", { name: "Challenges" })).toHaveCount(0);
    await expect(page.getByText(/could not be found|not found|404/i).first()).toBeVisible();

    // Put the catalogue back — every later spec runs against defaults.
    await resetCatalogue(page);
    await switchUser(context, INVITEE);
    await page.goto("/bridge/challenges");
    await expect(page.getByRole("heading", { name: "Challenges" })).toBeVisible();
  });

  test("the create wizard builds a challenge and it lands under Yours", async ({
    page,
    context,
  }) => {
    await switchUser(context, CREATOR);
    impsId = await createChallenge(page, {
      title: IMPS_TITLE,
      boards: 2,
      scoring: "Matchpoints",
      invite: [{ name: INVITEE_NAME }, { name: MODERATOR_NAME, moderator: true }],
    });

    await expect(page.getByText(`${IMPS_TITLE}`).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Yours" })).toBeVisible();

    const card = cardLink(page, IMPS_TITLE).first();
    await expect(card).toContainText("2 boards");
    await expect(card).toContainText("Matchpoint %");
    // Nothing has been played, so the entry CTA offers board 1 of 2.
    await expect(card).toContainText("Start · board 1 of 2");
  });

  test("an invitee sees it under Invited, accepts, and the card moves", async ({
    page,
    context,
  }) => {
    await switchUser(context, INVITEE);
    await page.goto("/bridge/challenges");

    await expect(page.getByRole("heading", { name: "Invited" })).toBeVisible();
    const invite = page.locator("article").filter({ hasText: IMPS_TITLE });
    await expect(invite).toBeVisible();
    await expect(invite.getByRole("button", { name: "Decline" })).toBeVisible();
    // A pending invite opens nothing (A1): the card is inert, not a link.
    await expect(cardLink(page, IMPS_TITLE)).toHaveCount(0);

    await invite.getByRole("button", { name: "Accept" }).click();
    await page.waitForURL(/\/bridge\/challenges$/);

    await expect(page.getByRole("heading", { name: "Yours" })).toBeVisible();
    await expect(cardLink(page, IMPS_TITLE).first()).toContainText("Start · board 1 of 2");
    await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
  });

  test("results are LOCKED for a participant who has not finished", async ({
    page,
    context,
  }) => {
    await switchUser(context, INVITEE);
    await page.goto(`/bridge/challenges/${impsId}/results`);

    await expect(page.getByText("Results are locked")).toBeVisible();
    await expect(page.getByText(/Results unlock when you finish all 2 boards/)).toBeVisible();
    await expect(page.getByText("0 of 2 boards done")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Standings", exact: true })).toHaveCount(0);
  });

  test("a moderator sees the standings without having finished", async ({ page, context }) => {
    // The creator is always a moderator (A2), so early sight is theirs by rule
    // even though they have played nothing.
    await switchUser(context, CREATOR);
    await page.goto(`/bridge/challenges/${impsId}/results`);

    await expect(page.getByRole("heading", { name: "Standings", exact: true })).toBeVisible();
    await expect(page.getByText("Results are locked")).toHaveCount(0);
    // The field is completed humans only — nobody has finished yet (A3).
    await expect(page.getByText("Nobody has finished every board yet.")).toBeVisible();
  });

  test("standingsVisibility: always opens the standings to everyone", async ({
    page,
    context,
  }) => {
    await switchUser(context, CREATOR);
    alwaysId = await createChallenge(page, {
      title: ALWAYS_TITLE,
      boards: 1,
      standingsAlways: true,
      invite: [{ name: INVITEE_NAME }],
    });
    await expect(cardLink(page, ALWAYS_TITLE).first()).toContainText("standings always");

    // The same non-moderator who was locked out above, on a challenge whose
    // setting says otherwise — one rule, one place (A3).
    await switchUser(context, INVITEE);
    await page.goto("/bridge/challenges");
    await page
      .locator("article")
      .filter({ hasText: ALWAYS_TITLE })
      .getByRole("button", { name: "Accept" })
      .click();
    await page.waitForURL(/\/bridge\/challenges$/);

    await page.goto(`/bridge/challenges/${alwaysId}/results`);
    await expect(page.getByRole("heading", { name: "Standings", exact: true })).toBeVisible();
    await expect(page.getByText("Results are locked")).toHaveCount(0);
  });

  test("without BEN a challenge board refuses to start, and says so", async ({
    page,
    context,
  }) => {
    // BEN_ENDPOINT is unset here. Challenges are BEN-only with no KB fallback
    // (spec §2), so the entry route must refuse rather than seat the shelved
    // house player in a one-attempt scored board.
    await switchUser(context, INVITEE);
    await page.goto("/bridge/challenges");
    await cardLink(page, IMPS_TITLE).first().click();

    await page.waitForURL(/\/bridge\/challenges\?error=/);
    await expect(
      page.getByText(/Challenges are played against BEN, and BEN isn't configured/),
    ).toBeVisible();
    // The attempt was NOT burned: the card still offers board 1.
    await expect(cardLink(page, IMPS_TITLE).first()).toContainText("Start · board 1 of 2");
  });

  test("phone viewport: the list and the results fit 390px", async ({ page, context }) => {
    await page.setViewportSize(PHONE);

    await switchUser(context, INVITEE);
    await page.goto("/bridge/challenges");
    await expect(page.getByRole("heading", { name: "Challenges" })).toBeVisible();
    expect(await overflowPx(page)).toBeLessThanOrEqual(1);

    // Locked results (the panel + progress rule).
    await page.goto(`/bridge/challenges/${impsId}/results`);
    await expect(page.getByText("Results are locked")).toBeVisible();
    expect(await overflowPx(page)).toBeLessThanOrEqual(1);

    // Unlocked results (tabs, standings card, the board-by-board disclosure).
    await switchUser(context, CREATOR);
    await page.goto(`/bridge/challenges/${impsId}/results`);
    await expect(page.getByRole("heading", { name: "Standings", exact: true })).toBeVisible();
    expect(await overflowPx(page)).toBeLessThanOrEqual(1);
  });
});
