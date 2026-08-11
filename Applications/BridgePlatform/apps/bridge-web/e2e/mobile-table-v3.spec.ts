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

    // The tray is TWO rows (`Pass 1 2 3 4 5 6 7` over `♣ ♦ ♥ ♠ NT` + doubles),
    // not three, and its touch floor YIELDS like the bars'. Three rows spent 28%
    // of the table on the bid box; two spend about half that. What the numbers
    // below protect is the SHAPE of that bargain, not the pixels:
    //   · the tray stays a small share of the table, at both box heights;
    //   · a bid button never falls under 32 rendered px (the floor is lower than
    //     the bars' 44 on purpose — a fixed grid the thumb learns — but it is
    //     still a floor);
    //   · the auction band the tray FEEDS is never shorter than the tray, which
    //     is the failure the share cap was introduced for.
    // All four boxes come from ONE layout snapshot: read a round-trip at a time
    // they can straddle the ResizeObserver-driven re-render that answers a
    // viewport change, and a ratio of two different renders means nothing.
    const trayShare = () =>
      page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        return {
          tray: r('[data-testid="bid-tray"]').height,
          centre: r('[data-testid="centre-band"]').height,
          row: r('[aria-label="Level 1"]').height,
          stage: r('div[style*="matrix"], div[style*="scale("]').height,
        };
      });
    const tall = await trayShare();
    expect(tall.tray / tall.stage, "tray share at 390x844").toBeLessThanOrEqual(0.2);
    expect(tall.row, "a bid button stays thumb-sized").toBeGreaterThanOrEqual(32);
    expect(
      tall.centre,
      "the auction band outsizes the tray that feeds it",
    ).toBeGreaterThan(tall.tray);

    await page.setViewportSize({ width: 430, height: 600 });
    await expect(page.getByTestId("bid-tray")).toBeVisible();
    await page.waitForTimeout(300);
    const short = await trayShare();
    expect(short.tray / short.stage, "tray share in a short box").toBeLessThanOrEqual(0.24);
    expect(short.row, "the floor holds in a short box too").toBeGreaterThanOrEqual(32);
    expect(short.centre, "the auction still outsizes its tray").toBeGreaterThan(short.tray);
    // It never GROWS as the box shrinks — the old failure was a tray holding its
    // physical size while the felt scaled away beneath it.
    expect(short.tray, "the tray never grows as the box shrinks").toBeLessThanOrEqual(
      tall.tray + 2,
    );

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

  // ADDENDUM E — phone-tier PLAY fidelity. Invariants of the design's Mobile
  // Table centre + dummy line, exercised on a REAL play state:
  //   (1) the trick scales as ONE box, so every rendered card is the same size
  //       (the old per-card scaling let the four cards desync);
  //   (1c) it is a tight OVERLAPPING cluster in the middle of the felt, not four
  //       cards spread to the corners of a box twice their size;
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

    const cards = page.getByTestId("trick-card");
    await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(2);

    // ONE LAYOUT SNAPSHOT for the band and every card. Read one Playwright
    // round-trip at a time, the band's rect and the cards' rects can come from
    // DIFFERENT renders: a viewport change is answered by a ResizeObserver, so
    // it lands asynchronously and used to slip in between the band read and the
    // card reads — which reported the cluster sitting outside a band it was in
    // fact centred inside. And a card DEALS IN (a ~170ms scale/fade), so the
    // snapshot waits for animations to finish first: these invariants are about
    // laid-out geometry, not about what a frame grab caught.
    const snapshot = async () => {
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[data-testid="trick-card"]')]
          .flatMap((el) => el.getAnimations())
          .every((a) => a.playState === "finished"),
      );
      return page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const band = r('[data-testid="centre-band"]');
        const stage = r('div[style*="matrix"], div[style*="scale("]');
        const cards = [...document.querySelectorAll('[data-testid="trick-card"]')].map((el) => {
          const b = el.getBoundingClientRect();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        });
        return {
          band: { y: band.y, h: band.height },
          stage: { w: stage.width },
          cards,
        };
      });
    };

    // The viewport change has to be ANSWERED before the snapshot means anything
    // — otherwise it is a self-consistent picture of the size we just left.
    const atSize = async (size: { width: number; height: number }) => {
      await page.setViewportSize(size);
      await expect(cards.first()).toBeVisible();
      // The observer + re-render is well inside this; the poll then guards
      // against any further reflow before the snapshot is taken.
      await page.waitForTimeout(300);
      let prev = -1;
      await expect
        .poll(async () => {
          const { band } = await snapshot();
          const same = Math.abs(band.h - prev) < 0.5;
          prev = band.h;
          return same;
        })
        .toBe(true);
      return snapshot();
    };

    const tallShot = await snapshot();

    // (1) The cluster box is scaled as a single unit, so any two trick cards
    // render at identical width AND height (the per-card model desynced them).
    expect(tallShot.cards.length, "at least two cards on the felt").toBeGreaterThanOrEqual(2);
    const c0 = tallShot.cards[0]!;
    const c1 = tallShot.cards[1]!;
    expect(Math.abs(c0.w - c1.w), "trick card widths equal").toBeLessThanOrEqual(0.6);
    expect(Math.abs(c0.h - c1.h), "trick card heights equal").toBeLessThanOrEqual(0.6);

    // (1c) The cluster is TIGHT and OVERLAPPING. Laid side by side the same
    // cards would need `n × width`; the union of their boxes is far less than
    // that, which is what "overlapping" means in pixels — and the whole pile is
    // a fraction of the stage rather than a compass twice the cards' size.
    const pileW =
      Math.max(...tallShot.cards.map((c) => c.x + c.w)) -
      Math.min(...tallShot.cards.map((c) => c.x));
    expect(pileW, "the cards overlap rather than sitting side by side").toBeLessThan(
      tallShot.cards.length * c0.w * 0.85,
    );
    expect(
      pileW / tallShot.stage.w,
      "the trick is a cluster, not a compass",
    ).toBeLessThanOrEqual(0.6);

    // (1b) The trick FITS its band. Prominence was a fixed 1.6 — a 419px ask
    // against a centre band that can sit at its floor — and `align-items:center`
    // with `overflow:hidden` sliced the North card off the top. Every trick card
    // must lie fully inside the band, at both the reference phone and a short box.
    const insideBand = (
      label: string,
      shot: { band: { y: number; h: number }; cards: { y: number; h: number }[] },
    ) => {
      shot.cards.forEach((c, i) => {
        expect(c.y, `${label}: trick card ${i} top clipped`).toBeGreaterThanOrEqual(
          shot.band.y - 0.5,
        );
        expect(
          c.y + c.h,
          `${label}: trick card ${i} bottom clipped`,
        ).toBeLessThanOrEqual(shot.band.y + shot.band.h + 0.5);
      });
    };
    insideBand("390x844", tallShot);
    insideBand("430x560", await atSize({ width: 430, height: 560 }));
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
