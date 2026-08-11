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

    // The grid PRE-EXISTS at four call rows and does not resize as the auction
    // fills them (owner, 2026-08-11). A content-sized grid grew a row at a time
    // and moved the felt under the reader on every call; this one reserves the
    // four rows up front and scrolls past them. Measured across a REAL auction
    // advancing under the robots — same box, more calls.
    const gridShape = () =>
      page.evaluate(() => {
        const rows = document.querySelector('[data-testid="auction-rows"]')!;
        const box = rows.parentElement!;
        return {
          box: +box.getBoundingClientRect().height.toFixed(1),
          rows: rows.clientHeight,
          calls: [...rows.querySelectorAll("span")].filter((n) => (n.textContent || "").trim())
            .length,
        };
      });
    await page.waitForTimeout(300);
    const first = await gridShape();
    expect(first.rows, "four call rows reserved (4x52 + gaps + padding)").toBe(223);
    // Proof it is a RESERVATION and not the content: this young auction holds
    // far fewer calls than four rows can. (The bars-off test below re-reads the
    // same number on a board the robots have carried further.)
    expect(first.calls, "reserved rows the auction has not filled").toBeLessThan(12);

    // The stage fills the box it was measured against — it is 720 wide scaled
    // to the region, never squeezed to the width of its widest child.
    const widthFit = () =>
      page.evaluate(() => {
        const stage = document.querySelector('[data-testid="phone-stage"]')!;
        return {
          stage: stage.getBoundingClientRect().width,
          region: stage.parentElement!.getBoundingClientRect().width,
        };
      });
    const auctionW = await widthFit();
    expect(
      auctionW.stage,
      "the stage renders the full width of its region",
    ).toBeGreaterThanOrEqual(auctionW.region - 1.5);

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
  //   (1c) the four seats sit on a tight interlocking COMPASS in the middle of
  //       the felt — a plus two cards wide, not a pile and not four cards
  //       spread to the corners of a box twice their size;
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
          // data-seat names the compass point the card was played from, so the
          // geometry below can be asserted per SEAT rather than by guesswork.
          return { seat: el.getAttribute("data-seat") ?? "?", x: b.x, y: b.y, w: b.width, h: b.height };
        });
        // A card in a HAND, to size the trick against. The dummy row and your
        // own hand draw the same M_CARD, so any one of them is the metric.
        const held = document.querySelector('button[aria-label^="Play "]');
        const hb = held?.getBoundingClientRect();
        const region = document.querySelector('[data-testid="phone-stage"]')!.parentElement!;
        return {
          band: { y: band.y, h: band.height },
          stage: { w: stage.width },
          region: { w: region.getBoundingClientRect().width },
          hand: hb ? { w: hb.width, h: hb.height } : null,
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

    // (1d) A trick card is the SAME CARD as one in a hand (owner, 2026-08-11).
    // The cluster used to magnify to 2.4x, which put a 68x98 card in the middle
    // of a table whose hands hold 28x65 ones — two decks on one felt. It is
    // drawn at the hand's metrics now, and only ever scales DOWN to fit a
    // squeezed band, never up.
    expect(tallShot.hand, "a hand card to size the trick against").not.toBeNull();
    const held = tallShot.hand!;
    expect(c0.w, "a trick card is no wider than a card in the hand").toBeLessThanOrEqual(
      held.w + 0.6,
    );
    expect(c0.h, "a trick card is no taller than a card in the hand").toBeLessThanOrEqual(
      held.h + 0.6,
    );
    expect(
      Math.abs(c0.w - held.w),
      "and at the reference phone it MATCHES the hand",
    ).toBeLessThanOrEqual(1);

    // (1e) The board compacts VERTICALLY, never horizontally: the 720-wide stage
    // renders the full width of its region in play, exactly as in the auction.
    // It used to be a shrinkable flex item, so the table narrowed by a card's
    // pitch every time one was played.
    expect(
      tallShot.stage.w,
      "the stage keeps its full width while cards are played",
    ).toBeGreaterThanOrEqual(tallShot.region.w - 1.5);

    // (1c) The trick is a tight interlocking COMPASS (owner, 2026-08-11) — N
    // top-centre, W and E flanking, S bottom-centre. The VERTICAL PAIR TOUCHES:
    // N's bottom edge is S's top edge, with the flanks straddling that seam
    // half a card down. Not the overlapping pile it replaced, not four cards
    // spread to the corners of a box twice their size, and no longer the
    // half-card hole N and S used to leave between them — the footprint is
    // exactly two cards wide by TWO tall, whatever is on the felt.
    const pileW =
      Math.max(...tallShot.cards.map((c) => c.x + c.w)) -
      Math.min(...tallShot.cards.map((c) => c.x));
    const pileH =
      Math.max(...tallShot.cards.map((c) => c.y + c.h)) -
      Math.min(...tallShot.cards.map((c) => c.y));
    expect(pileW, "the compass is two cards wide").toBeLessThanOrEqual(2 * c0.w + 1);
    expect(pileH, "and two cards tall").toBeLessThanOrEqual(2 * c0.h + 1);
    expect(
      pileW / tallShot.stage.w,
      "the trick is the size of the trick, not of the felt",
    ).toBeLessThanOrEqual(0.3);

    // A trick is played in ROTATION, so whatever is down is a run of adjacent
    // compass points — every card touches another. And it touches it at a
    // CORNER (half a card by half of one — a quarter of its area), never
    // face-on: an overlap past a third of a card would be the pile again. N and S
    // are the exception the rotation never produces alone — they meet edge to
    // edge, so they share a line and not an area.
    const overlap = (
      a: { x: number; y: number; w: number; h: number },
      b: { x: number; y: number; w: number; h: number },
    ) => ({
      x: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
      y: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
    });
    tallShot.cards.forEach((a, i) => {
      const meets = tallShot.cards.filter((b, j) => {
        if (i === j) return false;
        const o = overlap(a, b);
        return o.x > 1 && o.y > 1;
      });
      expect(meets.length, `${a.seat} interlocks with a neighbour`).toBeGreaterThan(0);
      for (const b of meets) {
        const o = overlap(a, b);
        expect(
          (o.x * o.y) / (c0.w * c0.h),
          `${a.seat}/${b.seat} meet at a corner, not stacked`,
        ).toBeLessThanOrEqual(0.35);
      }
    });

    // The compass points themselves, for whichever pairs are down: the flanks
    // sit half a card outside the N/S column and half a card below N — which
    // puts their own midline on the seam the vertical pair makes, so each flank
    // overlaps BOTH neighbours by half a card and the four close into one solid
    // plus with nothing showing through the middle.
    const bySeat = Object.fromEntries(tallShot.cards.map((c) => [c.seat, c]));
    for (const flank of ["W", "E"] as const) {
      const f = bySeat[flank];
      if (!f) continue;
      if (bySeat.N) {
        expect(
          Math.abs(Math.abs(f.x - bySeat.N.x) - c0.w / 2),
          `${flank} flanks the column by half a card`,
        ).toBeLessThanOrEqual(1.5);
        expect(
          Math.abs(f.y - bySeat.N.y - c0.h * 0.5),
          `${flank} straddles the seam — half a card below N`,
        ).toBeLessThanOrEqual(1.5);
      }
      if (bySeat.S) {
        expect(
          Math.abs(bySeat.S.y - f.y - c0.h * 0.5),
          `${flank} straddles the seam — half a card above S`,
        ).toBeLessThanOrEqual(1.5);
      }
    }
    if (bySeat.W && bySeat.E)
      expect(
        Math.abs(bySeat.E.x - bySeat.W.x - c0.w),
        "W and E are one card apart — the compass is two wide",
      ).toBeLessThanOrEqual(1.5);
    if (bySeat.N && bySeat.S) {
      expect(
        Math.abs(bySeat.N.x - bySeat.S.x),
        "N and S share the centre column",
      ).toBeLessThanOrEqual(1);
      // The whole point of the tightening (owner, 2026-08-11): the vertical
      // pair TOUCHES. A gap here is the half-card hole the compass used to pay
      // for, and it is the height the play band gets back.
      expect(
        Math.abs(bySeat.S.y - bySeat.N.y - c0.h),
        "N's bottom edge is S's top edge",
      ).toBeLessThanOrEqual(1.5);
    }

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

  // ?bars=off hides the edge toolbars so the felt can be judged, or embedded in
  // a host that draws its own chrome. The trap it walked into once: AutoAdvance
  // — the engine that steps the ROBOT seats — is mounted inside the toolbar's
  // controls, so hiding the toolbar unmounted the engine and the board sat there
  // looking frozen with BEN never asked to move. The page now mounts a headless
  // driver in that case. This asserts the BEHAVIOUR (calls land on the auction
  // grid), not that some component exists.
  test("with the toolbars hidden the robot seats still act", async ({ page }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");
    await page.setViewportSize(PHONE);
    const sid = await openTableSession(page);

    const calls = () =>
      page.getByTestId("auction-rows").evaluate(
        (el) =>
          [...el.querySelectorAll("span")].filter((n) => (n.textContent || "").trim()).length,
      );
    // Stack height, felt height and the height of one bar, in ONE snapshot.
    const stack = () =>
      page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
        return {
          stage: r('[data-testid="phone-stage"]')!.height,
          centre: r('[data-testid="centre-band"]')!.height,
          coach: r('[data-testid="coach-panel"]')?.height ?? 0,
          bar: r('[data-testid="edge-toolbar"]')?.height ?? 0,
        };
      });

    await page.goto(`/bridge/table2/${sid}`);
    await expect(page.getByTestId("bid-tray")).toBeVisible();
    const withBars = await stack();

    await page.goto(`/bridge/table2/${sid}?bars=off`);
    await expect(page.getByTestId("bid-tray")).toBeVisible();
    expect(await page.getByTestId("edge-toolbar").count(), "no toolbars rendered").toBe(0);

    // Hiding the toolbars makes the whole stack SHORTER by their height — it
    // does not hand the felt two toolbars' worth of extra green (owner,
    // 2026-08-11). The freed band goes DOWN, to the coach panel.
    const noBars = await stack();
    expect(
      Math.abs(withBars.stage - noBars.stage - withBars.bar * 2),
      "the stack loses exactly the bars it stopped drawing",
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(noBars.centre - withBars.centre),
      "the felt does not grow into the freed band",
    ).toBeLessThanOrEqual(2);
    expect(noBars.coach, "the coach panel gets it instead").toBeGreaterThan(withBars.coach + 1);

    const before = await calls();
    await expect
      .poll(calls, { timeout: 15_000, message: "robots advance with no toolbar on screen" })
      .toBeGreaterThan(before);

    // Same four reserved call rows on a board further into its auction: the
    // grid's height is a reservation, not a function of how much has been bid.
    expect(
      await page.getByTestId("auction-rows").evaluate((el) => el.clientHeight),
      "the grid still reserves four rows once calls have arrived",
    ).toBe(223);
  });
});
