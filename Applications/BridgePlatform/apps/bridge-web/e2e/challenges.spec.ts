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
//   · the result card's way onward from a finished board (Next board / See
//     your results), which needs a board played to its last trick
//     (challengeLogic.test.ts covers the choice, resultCard.test.ts the card);
//   · "BEN is thinking… / retry" — only reachable when a BEN call fails;
//   · comparisons and baselines — full-BEN, your-contract, from-this-point;
//   · the scored leaderboard and board-by-board grid with real figures
//     (resultsView.test.ts covers the arithmetic);
//   · "Replay for practice (unscored)" — it is gated on having FINISHED every
//     board, which cannot happen without BEN. Its GUARD is reachable and is
//     asserted below; what the replay then opens (and, in a bidding-only
//     challenge, where it stops) is unit-tested in challengeTable.test.ts.
//
// The same line runs through BIDDING-ONLY (owner, 2026-08-10): the option, its
// effect on the wizard and its survival through create → list → results ARE
// asserted below, because none of that needs a board to be played. What ends
// the board — the freeze at the close of the auction, the felt refusing to
// invite a card (in a practice replay as much as in the scored attempt), the
// contract-vs-BEN figures with real contracts in them, and how a finished
// auction-only line reads in a comparison — is downstream of BEN and lives in
// resultsView.test.ts, scoring.test.ts, lineModel.test.ts, challengeTable.test.ts
// and challengeBaselines.test.ts instead.
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
const BIDDING_TITLE = "E2E bidding-only challenge";

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
    /** Pick the bidding-only format in 01 · Basics. */
    biddingOnly?: boolean;
    standingsAlways?: boolean;
    invite?: readonly { name: string; moderator?: boolean }[];
  }>,
): Promise<string> {
  await page.goto("/bridge/challenges/new");
  await page.getByLabel("Title").fill(opts.title);

  // Format before scoring: a bidding-only challenge is not scored against a
  // field, so the scoring chips are not on the page at all once it is picked.
  if (opts.biddingOnly)
    await page.getByRole("button", { name: "Bidding only", exact: true }).click();
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
let biddingId = "";

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

  test("a BBO hand link becomes a board, keeping its dealer and vulnerability", async ({
    page,
    context,
  }) => {
    await switchUser(context, CREATOR);
    await page.goto("/bridge/challenges/new");

    // The hand-parameter form, which handviewer.js turns into `md|<dealer>S,W,N,E`.
    // West deals, E-W vulnerable — neither is what board 1 of the standard
    // cycle would give (North / none), so the board must be carrying its own.
    const HANDS =
      "s=SAKQJHAKQDAKQCAKQ&w=S32H32D32C32456&n=ST98H98D98C98J&e=S7654H7654D7654C7";
    const link = `https://www.bridgebase.com/tools/handviewer.html?${HANDS}&d=w&v=e&b=3`;

    await page.getByLabel("BBO hand links").fill(link);
    await page.getByRole("button", { name: "Replace all" }).click();

    // One board, and it is the imported one: West deals, E-W vulnerable.
    await expect(page.getByText("1 board from BBO.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dealer W" })).toBeVisible();
    await expect(page.getByText("Vul E-W")).toBeVisible();
    // Choosing the deal is disclosed exactly like opening the pack editor.
    await expect(page.getByText(/Editor badge will apply/)).toBeVisible();

    // A link with no deal in it says so, and changes nothing.
    await page.getByLabel("BBO hand links").fill("https://www.bridgebase.com/tools/handviewer.html?pc=y");
    await page.getByRole("button", { name: "Add boards" }).click();
    await expect(page.getByText(/No deal in that link/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Dealer W" })).toBeVisible();

    // The per-board door does the same to ONE board: fold it open, paste, use.
    await page.getByRole("button", { name: "BBO link" }).first().click();
    await page
      .getByLabel("BBO hand link for board 1")
      .fill(`https://www.bridgebase.com/tools/handviewer.html?${HANDS}&d=s&v=b`);
    await page.getByRole("button", { name: "Use deal" }).click();
    await expect(page.getByRole("button", { name: "Dealer S" })).toBeVisible();
    await expect(page.getByText("Vul Both")).toBeVisible();

    // It survives the round trip: create, then the board opens with the seat
    // and the vulnerability the link carried.
    await page.getByLabel("Title").fill("E2E imported board");
    await page.getByRole("button", { name: "Create challenge" }).first().click();
    await page.waitForURL(/\/bridge\/challenges\?created=/);
    await expect(cardLink(page, "E2E imported board").first()).toContainText(
      "board 1 of 1",
    );
  });

  test("bidding-only: the wizard offers it, and it survives the round trip", async ({
    page,
    context,
  }) => {
    await switchUser(context, CREATOR);
    await page.goto("/bridge/challenges/new");

    // The default is the v1 board, and the scoring question belongs to it.
    await expect(page.getByRole("button", { name: "Bid & play", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "IMPs", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Bidding only", exact: true }).click();
    // Scoring is a question about a field of played boards. There is none, so
    // the control is GONE rather than sitting there inert.
    await expect(page.getByRole("button", { name: "IMPs", exact: true })).toHaveCount(0);
    await expect(page.getByText(/The board ends when the auction ends/)).toBeVisible();

    // The Review step and the draft rail both say which mode it is in.
    await expect(
      page.getByText(/Bidding only — the board ends with the auction/),
    ).toBeVisible();
    await expect(
      page.getByText("Matched BEN's contract, board by board — no field scoring"),
    ).toBeVisible();
    await expect(page.getByText("BEN's own auction is the reference")).toBeVisible();

    biddingId = await createChallenge(page, {
      title: BIDDING_TITLE,
      boards: 2,
      biddingOnly: true,
      invite: [{ name: INVITEE_NAME }],
    });
    const id = biddingId;

    // Round trip: the stored record reads back as bidding-only, and the card
    // names the format rather than a scoring mode it does not use.
    const card = cardLink(page, BIDDING_TITLE).first();
    await expect(card).toContainText("2 boards");
    await expect(card).toContainText("Bidding only");
    await expect(card).not.toContainText("IMPs vs datum");

    // The creator is always a moderator, so the results are open to them (A2).
    await page.goto(`/bridge/challenges/${id}/results`);
    await expect(page.getByText("2 boards · Bidding only · by you")).toBeVisible();
    await expect(page.getByText("Contract vs BEN")).toBeVisible();
    await expect(page.getByText("Nobody has finished every board yet.")).toBeVisible();
    // Nothing prints a score where there is none.
    await expect(page.getByText("IMPs vs datum")).toHaveCount(0);

    // A bidding-only board still refuses to start without BEN — the format
    // changes what a board asks for, never the no-fallback rule (spec §2).
    await page.goto("/bridge/challenges");
    await cardLink(page, BIDDING_TITLE).first().click();
    await page.waitForURL(/\/bridge\/challenges\?error=/);
    await expect(
      page.getByText(/Challenges are played against BEN, and BEN isn't configured/),
    ).toBeVisible();
  });

  test("a practice replay opens nothing until the challenge is finished", async ({
    page,
    context,
  }) => {
    // The replay link itself needs a finished board, so it is out of reach here
    // — but the door it points at is addressable, and it must refuse. Nothing
    // is started, in either format: a practice copy sitting beside a live
    // attempt on the same deal is the spoiler the whole-challenge unlock
    // forbids, and this is the guard that stops it.
    await switchUser(context, CREATOR);
    await page.goto(`/bridge/challenges/${biddingId}/play?board=1&practice=1`);
    await page.waitForURL(new RegExp(`/bridge/challenges/${biddingId}/results$`));
    await expect(page.getByText("2 boards · Bidding only · by you")).toBeVisible();

    // …and the attempt was not burned: board 1 is still there to be started.
    await page.goto("/bridge/challenges");
    await expect(cardLink(page, BIDDING_TITLE).first()).toContainText("board 1 of 2");
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

// A challenge you MADE can be kept — its boards, format and scoring saved to
// the library so the same contest can be set again (owner, 2026-08-14). The
// boards are the substance: a challenge without its pack is a title, so this
// asserts the count survives the round trip rather than only the name.
test("save a challenge to the library, boards and all", async ({ page }) => {
  test.setTimeout(150_000);
  await switchUser(page.context(), "user_orgadmin_olivia");
  const title = "E2E keep-me challenge";
  await createChallenge(page, { title, boards: 2 });

  const save = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save to library" }) })
    .first()
    .getByRole("button", { name: "Save to library" });
  await expect(save, "the creator is offered the save").toBeVisible();
  await save.click();

  await page.waitForURL(/\/bridge\/library\?kind=challenge/);
  await expect(page.getByText(title).first()).toBeVisible();
  await expect(
    page.getByText(/2 boards/).first(),
    "the boards came with it, not just the title",
  ).toBeVisible();
});
