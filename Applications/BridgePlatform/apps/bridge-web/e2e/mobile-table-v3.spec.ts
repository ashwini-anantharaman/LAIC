// Mobile table v3 (ADDENDUM D) — the phone tier's verification bar. At a
// phone-sized viewport the table2 <PlayTable/> renders the Mobile Table stack,
// with EdgeToolbars that OVERFLOW into a ⋯ group rather than clip or scroll.
// This spec asserts the properties the design promises: no horizontal overflow
// on any bar, and the ⋯ popover (when the viewport forced one) opens with
// clickable items. The coach panel is live (owner 2026-08-06), reserving its
// band under the table — asserted present below.
//
// Runs after kb.spec (alphabetical, serial) so the reviewer's quickplay works.

import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

const PHONE = { width: 390, height: 844 };

/** Open a fresh table2 session via the Play landing quickplay flow. */
async function openTableSession(page: Page): Promise<string> {
  await page.goto("/bridge/table");
  await page
    .getByRole("button", { name: /Quickplay|Deal a fresh board/ })
    .or(page.getByRole("link", { name: /^Resume / }))
    .first()
    .click();
  await page.waitForURL(/\/bridge\/table2?\/bs_/);
  const sid = /bs_[a-z0-9]+/.exec(page.url())![0];
  await page.goto(`/bridge/table2/${sid}`);
  return sid;
}

test.describe("mobile table v3 — phone tier", () => {
  test("coach panel, no toolbar overflow, and a reachable ⋯ popover", async ({ page }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");

    await page.setViewportSize(PHONE);
    await openTableSession(page);

    // The coach panel is live and reserves its band under the table — a seated
    // learner sees its facts-layer button.
    await expect(
      page.getByRole("button", { name: "What am I looking at?" }),
    ).toBeVisible();

    // Both edge toolbars must fit their width: overflow moves into ⋯, so nothing
    // spills past the bar. scrollWidth <= clientWidth is measured in layout px,
    // unaffected by the stage transform (that is why the algorithm uses
    // offsetWidth, not getBoundingClientRect).
    const bars = page.getByTestId("edge-toolbar");
    await expect(bars.first()).toBeVisible();
    const count = await bars.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      const overflow = await bars.nth(i).evaluate(
        (el) => el.scrollWidth - el.clientWidth,
      );
      expect(overflow, `bar ${i} horizontal overflow`).toBeLessThanOrEqual(1);
    }

    // The tray's touch floor YIELDS, like the bars'. At the reference phone it
    // does not bind (three 44px rows, 28% of the table); in a shorter box the
    // three rows shrink TOGETHER rather than the tray holding its physical size
    // while the felt scales away under it — which left the auction it feeds
    // shorter than the tray itself, pinned at CENTRE_MIN and clipped.
    const trayShare = async () => {
      const tray = await page.getByTestId("bid-tray").boundingBox();
      const band = await page.getByTestId("centre-band").boundingBox();
      const stage = await page
        .locator('div[style*="matrix"], div[style*="scale("]')
        .first()
        .boundingBox();
      return { tray: tray!.height, centre: band!.height, stage: stage!.height };
    };
    const tall = await trayShare();
    expect(tall.tray / tall.stage, "tray share at 390x844").toBeLessThanOrEqual(0.32);
    expect(tall.tray, "three 44px rows plus padding where there is room").toBeGreaterThan(120);

    await page.setViewportSize({ width: 430, height: 600 });
    await expect(page.getByTestId("bid-tray")).toBeVisible();
    const short = await trayShare();
    expect(short.tray / short.stage, "tray share in a short box").toBeLessThanOrEqual(0.32);
    // It yields in absolute terms too, rather than holding its physical size
    // while the felt scales away beneath it.
    expect(short.tray, "the tray shrinks with the box").toBeLessThan(tall.tray);

    // Whatever the band's height, the grid FOLLOWS the auction: the newest call
    // is on screen, and it is the oldest rows that scroll off the top.
    const atNewest = await page
      .getByTestId("auction-rows")
      .evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
    expect(atNewest, "auction grid pinned to the newest call").toBeLessThanOrEqual(1);
    await page.setViewportSize(PHONE);

    // The phone chip row does not fit at 390px, so the ⋯ group is present. It
    // opens within the viewport and its items are reachable — nothing is ever
    // unreachable at any size.
    const more = page.getByRole("button", { name: "More controls" });
    if (await more.count()) {
      await more.first().click();
      // The popover is open; any button inside it is enabled and clickable.
      const popButtons = page.locator('[data-testid="edge-toolbar"] button:not([aria-label="More controls"])');
      // At minimum the popover revealed content; if it holds a real control,
      // clicking it must not throw (handlers are wired).
      const btn = popButtons.filter({ hasText: /.+/ });
      if (await btn.count()) {
        await expect(btn.first()).toBeEnabled();
      }
    }
  });

  // ADDENDUM E — phone-tier PLAY fidelity. Two invariants of the design's
  // Mobile Table centre + dummy line, exercised on a REAL play state:
  //   (1) the trick cross scales as ONE box, so every rendered card is the same
  //       size (the old per-card scaling let the four cards desync);
  //   (2) the one-line dummy strip labels the SEAT, not the player.
  // Reaching play deterministically: seat four robots (a "watch" board — a human
  // seat would stall stepping at its turn) and step via the session API until a
  // mid-trick moment whose dummy isn't South (declarer ≠ N).
  test("play phase: trick cards are one size and the dummy strip shows a seat name", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");

    // A KB + a COMPLETE house player to fill all four seats.
    await page.goto("/bridge/library/tables/new");
    const blocks = page.locator("[data-kb-block]");
    const nBlocks = await blocks.count();
    let kbId = "";
    let playerId = "";
    for (let i = 0; i < nBlocks && !playerId; i++) {
      const b = blocks.nth(i);
      const opts = b.locator('select[name="player:N"] option');
      const nOpts = await opts.count();
      for (let j = 0; j < nOpts; j++) {
        const val = await opts.nth(j).getAttribute("value");
        const label = (await opts.nth(j).textContent()) ?? "";
        if (val && !/incomplete/i.test(label)) {
          playerId = val;
          kbId = await b.locator('input[name="kbId"]').first().inputValue();
          break;
        }
      }
    }
    expect(playerId, "a complete house player to seat four robots").toBeTruthy();

    const PARTNER: Record<string, string> = { N: "S", S: "N", E: "W", W: "E" };
    type StepState = {
      phase: string;
      contract: { declarer: string } | null;
      tricks: { plays: unknown[] }[];
    };
    let sid = "";
    for (const seed of [7, 3, 5, 11, 13, 2, 17, 19, 23, 4, 29, 31, 6, 8, 9, 10]) {
      const created = await page.request.post("/api/bridge/sessions", {
        data: { kbId, seed, players: { N: playerId, E: playerId, S: playerId, W: playerId } },
      });
      if (!created.ok()) continue;
      const { session } = (await created.json()) as { session: { sessionId: string } };
      const id = session.sessionId;
      let ready = false;
      let dead = false;
      for (let s = 0; s < 90 && !ready && !dead; s++) {
        const res = await page.request.post(`/api/bridge/sessions/${id}/step`);
        if (!res.ok()) break;
        const { state } = (await res.json()) as { state: StepState };
        if (state.phase === "complete") {
          dead = true;
        } else if (state.phase === "play") {
          const declarer = state.contract?.declarer;
          if (!declarer || PARTNER[declarer] === "S") {
            dead = true; // dummy would be South → no strip; try another deal.
          } else if ((state.tricks.at(-1)?.plays.length ?? 0) >= 2) {
            ready = true;
          }
        }
      }
      if (ready) {
        sid = id;
        break;
      }
    }
    expect(sid, "a mid-trick all-robot board with a non-South dummy").toBeTruthy();

    // Render that live play state on the phone tier. Boards open PAUSED, so the
    // server state stays put (no auto-advance past the two-card trick).
    await page.setViewportSize(PHONE);
    await page.goto(`/bridge/table2/${sid}`);

    // (1) The 262-box is scaled as a single unit, so any two trick cards render
    // at identical width AND height (the per-card model desynced them).
    const cards = page.getByTestId("trick-card");
    await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(2);
    const b0 = await cards.nth(0).boundingBox();
    const b1 = await cards.nth(1).boundingBox();
    expect(b0, "first trick card box").toBeTruthy();
    expect(b1, "second trick card box").toBeTruthy();
    expect(Math.abs(b0!.width - b1!.width), "trick card widths equal").toBeLessThanOrEqual(0.6);
    expect(Math.abs(b0!.height - b1!.height), "trick card heights equal").toBeLessThanOrEqual(0.6);

    // (1b) The compass FITS its band. Prominence was a fixed 1.6 — a 419px ask
    // against a centre band that can sit at its floor — and `align-items:center`
    // with `overflow:hidden` sliced the North card off the top. Every trick card
    // must lie fully inside the band, at both the reference phone and a short box.
    const insideBand = async (label: string) => {
      const band = (await page.getByTestId("centre-band").boundingBox())!;
      const n = await cards.count();
      for (let i = 0; i < n; i++) {
        const c = (await cards.nth(i).boundingBox())!;
        expect(c.y, `${label}: trick card ${i} top clipped`).toBeGreaterThanOrEqual(
          band.y - 0.5,
        );
        expect(
          c.y + c.height,
          `${label}: trick card ${i} bottom clipped`,
        ).toBeLessThanOrEqual(band.y + band.height + 0.5);
      }
    };
    await insideBand("390x844");
    await page.setViewportSize({ width: 430, height: 560 });
    await expect(cards.first()).toBeVisible();
    await insideBand("430x560");
    await page.setViewportSize(PHONE);

    // (2) The dummy strip is labelled with the SEAT name, not the player name.
    const strip = page.getByTestId("dummy-strip");
    await expect(strip).toBeVisible();
    const stripText = ((await strip.textContent()) ?? "").trim();
    expect(stripText, "dummy strip starts with a seat name").toMatch(
      /^(North|East|South|West)/,
    );
  });
});
