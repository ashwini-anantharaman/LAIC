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

/**
 * A FRESH board with a human South, for the interaction tests below.
 *
 * Deliberately not `openTableSession`: that one takes Quickplay OR a Resume
 * link, whichever the DOM offers first, and a resumed board can be one where
 * South is dummy or the play is nearly over — so a test that needs to play a
 * card from South's hand failed about half the time on the resume. Dealing
 * fresh always starts at the auction with South able to bid it out.
 */
async function freshHumanTable(page: Page): Promise<void> {
  await page.goto("/bridge/table");
  const quick = page.getByRole("button", { name: /Quickplay|Deal a fresh board/ }).first();
  if (await quick.count()) await quick.click();
  else await page.getByRole("link", { name: /^Resume / }).first().click();
  await page.waitForURL(/\/bridge\/table2?\/bs_/);
  await page.goto(`/bridge/table2/${/bs_[a-z0-9]+/.exec(page.url())![0]}`);
}

/**
 * The label of a card you may play right now, once the table is willing.
 *
 * Three things can stand between "the board is up" and "a card is live", and a
 * test that only knows about one of them hangs on the others: the auction may
 * still be running, a finished trick may be HELD (the hand is inert until it is
 * let go — that is the point of the hold), and the robots may simply be mid
 * think. Playability is `cursor: pointer` plus an armed handler rather than an
 * attribute, so it has to be read off the computed style.
 *
 * `pick` matters for the flight test: the leftmost card is the one whose
 * horizontal origin is unmistakable.
 */
async function playableCard(page: Page, pick: "any" | "leftmost" = "any"): Promise<string | null> {
  const armed = (sel: string, leftmost: boolean) =>
    page
      .evaluate(
        ({ sel: q, leftmost: lm }) => {
          const live = [...document.querySelectorAll(q)].filter(
            (x) => getComputedStyle(x).cursor === "pointer",
          );
          if (lm) live.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
          return live.length ? live[0]!.getAttribute("aria-label") : null;
        },
        { sel, leftmost },
      )
      .catch(() => null);

  for (let i = 0; i < 200; i++) {
    const card = await armed('button[aria-label^="Play "]', pick === "leftmost");
    if (card) return card;
    if ((await page.locator('[data-testid="trick-card"]').count()) === 4) {
      // A held trick: let it go so play can continue.
      await page.getByTestId("phone-stage").click({ position: { x: 5, y: 5 } }).catch(() => {});
    } else if (await armed('button[aria-label="Pass"]', false)) {
      await page.locator('button[aria-label="Pass"]').first().click({ timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(250);
  }
  return null;
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
  test("play phase: the trick is bigger than the hand, and the dummy strip shows a seat name", async ({
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
          // Is this card's INDEX actually unobstructed? Hit-test all four
          // corners of the rank/pip block: a wide two-glyph "10" can have a
          // readable middle and a covered edge, so the centre alone lies.
          const idx = el.firstElementChild;
          let readable = true;
          if (idx) {
            const r = idx.getBoundingClientRect();
            const corners: [number, number][] = [
              [r.left + 1, r.top + 1], [r.right - 1, r.top + 1],
              [r.left + 1, r.bottom - 1], [r.right - 1, r.bottom - 1],
            ];
            readable = corners.every(([x, y]) => el.contains(document.elementFromPoint(x, y)));
          }
          return { seat: el.getAttribute("data-seat") ?? "?", x: b.x, y: b.y, w: b.width, h: b.height, readable };
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

    // (1d) A trick card is BIGGER than a card in the hand — 1.3x on height
    // (owner, 2026-08-12), reversing the 2026-08-11 rule that the two match.
    // At hand size the played cards receded: the trick is the one thing every
    // player is looking at, and it read as four more cards rather than as the
    // trick. This is the ceiling too — it must never reach the 2.4x magnify
    // that once put two visibly different decks on one felt.
    expect(tallShot.hand, "a hand card to size the trick against").not.toBeNull();
    const held = tallShot.hand!;
    expect(c0.h / held.h, "a trick card is ~1.3x a hand card's height").toBeGreaterThan(1.15);
    expect(c0.h / held.h, "and not the 2.4x magnify that made it a second deck").toBeLessThan(1.6);
    // The RATIO changes with the size and matters as much: a hand card is a
    // tall 1:1.71 sliver because it is only ever seen as an index strip under
    // its neighbour, while a trick card is seen whole and takes a real card's
    // 1:1.4. Scaling the hand's ratio instead produced a card so narrow that a
    // two-glyph "10" spilled out of the corner reserved to keep it readable.
    expect(c0.w / c0.h, "a trick card has a real card's proportions").toBeGreaterThan(0.62);
    expect(c0.w / c0.h, "not the hand's tall sliver").toBeLessThan(0.78);

    // (1f) EVERY CARD SAYS WHAT IT IS. Paint order is play order now (owner,
    // 2026-08-12), so any card can land over any other and the layout may not
    // rely on knowing who covers whom. Each card carries its index on the edge
    // facing away from the centre — N/W top-left, E top-right, S bottom-left —
    // which is outside the cluster by construction. This asserts the property
    // itself, on whatever the deal happened to put down, rather than a spacing
    // ratio that stands in for it: the previous proxy passed while a real "10"
    // was clipped, and would need rewriting on every geometry change.
    for (const c of tallShot.cards) {
      expect(c.readable, `${c.seat}'s rank and pip are not covered by a sibling`).toBe(true);
    }

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
    // Two cards wide PLUS a seam. The seam (0.15 of a card) is what lets E keep
    // its index on its outward edge clear of N's and S's bodies, now that paint
    // order is play order and any card may land over any other.
    expect(pileW, "the compass is two cards and a seam wide").toBeLessThanOrEqual(
      2 * c0.w + 0.15 * c0.w + 2,
    );
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
    // sit half a card-and-seam outside the N/S column and half a card below N —
    // which puts their own midline on the seam the vertical pair makes, so each
    // flank overlaps BOTH neighbours and the four close into one solid plus with
    // nothing showing through the middle. The horizontal offset is half of
    // (card + seam), not half a card: the seam was added so E's outward index
    // clears N and S once paint order became play order.
    const bySeat = Object.fromEntries(tallShot.cards.map((c) => [c.seat, c]));
    for (const flank of ["W", "E"] as const) {
      const f = bySeat[flank];
      if (!f) continue;
      if (bySeat.N) {
        expect(
          Math.abs(Math.abs(f.x - bySeat.N.x) - (c0.w + 0.15 * c0.w) / 2),
          `${flank} flanks the column by half a card and seam`,
        ).toBeLessThanOrEqual(1.5);
        // The flank sits below N's top and above N's bottom — it STRADDLES the
        // seam rather than sitting beside the column or under it. How far down
        // is not asserted here: what actually matters is that no index gets
        // covered, and that is checked directly below for every card on the
        // felt rather than inferred from an offset ratio.
        const drop = f.y - bySeat.N.y;
        expect(drop, `${flank} starts below N's top`).toBeGreaterThan(0);
        expect(drop, `${flank} straddles the seam rather than clearing N`).toBeLessThan(c0.h);
        expect(drop, `${flank} still overlaps N`).toBeLessThan(c0.h);
      }
      if (bySeat.S) {
        // …and still crosses the seam into S, so the cross stays one shape.
        expect(
          bySeat.S.y - f.y,
          `${flank} straddles the seam into S`,
        ).toBeGreaterThan(0);
        expect(
          bySeat.S.y - f.y,
          `${flank} overlaps S rather than clearing it`,
        ).toBeLessThan(c0.h);
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

  // The safe default, and the reason the setting exists (decisions doc, "Play
  // modes"): `raise` ships ON, so a tap LIFTS a card and only a second tap on
  // the same card plays it. Nothing else in this suite plays a card by
  // clicking one, so without this the default could invert and every test
  // would still pass.
  test("raise mode: a first tap lifts a card and never plays it", async ({ page }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");
    await page.setViewportSize(PHONE);
    await freshHumanTable(page);

    // Playability is cursor:pointer + an armed handler, not an attribute.
    const armed = (q: string) =>
      page
        .evaluate((sel) => {
          const b = [...document.querySelectorAll(sel)].find(
            (x) => getComputedStyle(x).cursor === "pointer",
          );
          return b ? b.getAttribute("aria-label") : null;
        }, q)
        .catch(() => null);

    const card = await playableCard(page);
    expect(card, "a playable card once the auction is out").toBeTruthy();
    const sel = `button[aria-label="${card}"]`;
    const before = await page.locator('button[aria-label^="Play "]').count();

    await page.locator(sel).first().click();
    await page.waitForTimeout(400);
    expect(await page.locator(sel).count(), "the card is still in the hand").toBeGreaterThan(0);
    expect(
      await page.locator('button[aria-label^="Play "]').count(),
      "no card left any hand on the first tap",
    ).toBe(before);
    expect(
      await page.locator(sel).first().getAttribute("data-held"),
      "and it is marked as the card the next tap commits",
    ).not.toBeNull();

    // A tap anywhere that is not a card puts it back down.
    await page.getByTestId("phone-stage").click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);
    expect(
      await page.locator(sel).first().getAttribute("data-held"),
      "a tap off the cards clears the lift",
    ).toBeNull();

    // Two taps on the same card play it.
    await page.locator(sel).first().click();
    await page.waitForTimeout(200);
    await page.locator(sel).first().click();
    await expect(page.locator(sel)).toHaveCount(0, { timeout: 5000 });
  });

  // The played card travels from WHERE IT SAT (owner, 2026-08-13: "make it
  // glide from the position of the card in the hand to the middle, not just
  // from the middle always"). The seat-direction keyframes could only start a
  // card from a fixed vector, so every South card rose from the same spot.
  // Playing the LEFTMOST playable card is what makes the horizontal component
  // provable: a fixed-vector glide has no x at all.
  test("a played card flies from its place in the hand, not from the middle", async ({ page }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");
    await page.setViewportSize(PHONE);
    await freshHumanTable(page);

    const leftmostArmed = (q: string) =>
      page
        .evaluate((sel) => {
          const live = [...document.querySelectorAll(sel)].filter(
            (x) => getComputedStyle(x).cursor === "pointer",
          );
          live.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
          return live.length ? live[0]!.getAttribute("aria-label") : null;
        }, q)
        .catch(() => null);

    const card = await playableCard(page, "leftmost");
    expect(card, "a playable card once the auction is out").toBeTruthy();

    // Sample the trick card's transform every frame, from before it exists.
    await page.evaluate(() => {
      const w = window as unknown as { __t: string[] };
      w.__t = [];
      const t0 = performance.now();
      const tick = () => {
        const el = document.querySelector('[data-testid="trick-card"][data-seat="S"]');
        if (el) w.__t.push(getComputedStyle(el).transform);
        if (performance.now() - t0 < 6000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // Two taps, because `raise` is the default.
    await page.locator(`button[aria-label="${card}"]`).first().click();
    await page.waitForTimeout(120);
    await page.locator(`button[aria-label="${card}"]`).first().click();
    await page.waitForTimeout(900);

    const frames = (await page.evaluate(() => (window as unknown as { __t: string[] }).__t))
      .map((m) => /matrix\(([^)]+)\)/.exec(m)?.[1]?.split(",").map(Number))
      .filter((a): a is number[] => !!a && a.length === 6)
      .map((a) => ({ x: Math.round(a[4]!), y: Math.round(a[5]!) }));
    expect(frames.length, "the card was sampled while it travelled").toBeGreaterThan(2);
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    // The hand sits BELOW the trick, so the start offset is positive in y; the
    // leftmost card is well to the left of its slot, so x is large too. Both are
    // in the element's own coordinates — the stage scale is divided out.
    expect(first.y, "it starts down at the hand").toBeGreaterThan(40);
    expect(Math.abs(first.x), "and sideways at the card, not the middle").toBeGreaterThan(40);
    expect(Math.abs(last.y), "and settles into its slot").toBeLessThan(6);
    expect(Math.abs(last.x), "and settles into its slot").toBeLessThan(6);
  });

  // The plate under your hand is ONE SIZE all board (owner, 2026-08-13, having
  // raised it twice: "why does the nameplate shrink with the cards. it should be
  // the same size"). It used to span the hand's actual width, so it crept inward
  // by a pitch on every card played; a floor was tried first and only moved
  // where the shrinking stopped, which is why this is pinned by width equality
  // rather than by a minimum.
  test("the seat plate is the same width all board", async ({ page }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");
    await page.setViewportSize(PHONE);
    await freshHumanTable(page);

    const armed = (q: string) =>
      page
        .evaluate((sel) => {
          const b = [...document.querySelectorAll(sel)].find(
            (x) => getComputedStyle(x).cursor === "pointer",
          );
          return b ? b.getAttribute("aria-label") : null;
        }, q)
        .catch(() => null);
    const plateW = () =>
      page.evaluate(() => {
        const el = document.querySelector(
          '[data-testid="phone-stage"] [data-testid="seat-plate"][data-seat="S"]',
        );
        return el ? Math.round(el.getBoundingClientRect().width) : -1;
      });

    const widths: number[] = [];
    for (let round = 0; round < 4; round++) {
      const card = await playableCard(page);
      if (!card) break;
      widths.push(await plateW());
      // `raise` is the default, so two taps.
      await page.locator(`button[aria-label="${card}"]`).first().click();
      await page.waitForTimeout(150);
      await page.locator(`button[aria-label="${card}"]`).first().click();
      await page.waitForTimeout(1400);
    }
    expect(widths.length, "several cards were played").toBeGreaterThan(2);
    expect(widths.every((w) => w > 0), "the plate was found each time").toBe(true);
    expect(new Set(widths).size, `one width all board, saw ${JSON.stringify(widths)}`).toBe(1);
  });

  // A finished trick WAITS (decisions doc, "Trick pause"; default `tap`). Three
  // properties, and the first two are what make it worth having: the trick is
  // not swept by the beat that would otherwise step the robots on, and the hand
  // is inert so the winner — who may be you — cannot lead to the next trick
  // before seeing who took this one.
  test("a finished trick waits for a tap, with the hand inert", async ({ page }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");
    await page.setViewportSize(PHONE);
    await freshHumanTable(page);

    const armed = (q: string) =>
      page
        .evaluate((sel) => {
          const b = [...document.querySelectorAll(sel)].find(
            (x) => getComputedStyle(x).cursor === "pointer",
          );
          return b ? b.getAttribute("aria-label") : null;
        }, q)
        .catch(() => null);
    const trickCards = () => page.locator('[data-testid="trick-card"]').count();

    for (let round = 0; round < 14; round++) {
      if ((await trickCards()) === 4) break;
      let card: string | null = null;
      for (let i = 0; i < 120 && !card; i++) {
        if ((await trickCards()) === 4) break;
        card = await armed('button[aria-label^="Play "]');
        if (card) break;
        if (await armed('button[aria-label="Pass"]'))
          await page.locator('button[aria-label="Pass"]').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(250);
      }
      if ((await trickCards()) === 4 || !card) break;
      await page.locator(`button[aria-label="${card}"]`).first().click();
      await page.waitForTimeout(150);
      await page.locator(`button[aria-label="${card}"]`).first().click();
      await page.waitForTimeout(1200);
    }
    expect(await trickCards(), "a full trick on the felt").toBe(4);

    // Well past the 750ms beat that would otherwise have stepped it on.
    await page.waitForTimeout(4000);
    expect(await trickCards(), "it waited instead of being swept").toBe(4);
    // The pause is legible without a caption: the card that took the trick
    // lifts and rings. It also answers who won, which a caption never did.
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="trick-card"]')].filter((e) => {
          // The lift is on the WRAPPER, not the card: a card that glided in
          // keeps a filling keyframe animation, and that beats an inline
          // transform. And a card that has finished travelling sits at the
          // IDENTITY matrix, which is not "none" — so test for the lift itself
          // rather than for having any transform, or every card counts.
          const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(e.parentElement!).transform);
          if (!m) return false;
          const n = m[1]!.split(",").map(Number);
          return Math.abs(n[0]! - 1) > 0.01 || Math.abs(n[5]!) > 1;
        }).length,
      ),
      "exactly one card — the winner — is lifted",
    ).toBe(1);
    expect(await armed('button[aria-label^="Play "]'), "the hand is inert while it waits").toBeNull();

    // A tap anywhere gathers it.
    await page.getByTestId("phone-stage").click({ position: { x: 5, y: 5 } });
    await expect.poll(() => trickCards(), { timeout: 12000 }).toBeLessThan(4);
  });
});
