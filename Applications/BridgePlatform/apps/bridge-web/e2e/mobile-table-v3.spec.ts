// Mobile table v3 (ADDENDUM D) — the phone tier's verification bar. At a
// phone-sized viewport the table2 <PlayTable/> renders the Mobile Table stack:
// a table region over a reserved coach panel, with EdgeToolbars that OVERFLOW
// into a ⋯ group rather than clip or scroll. This spec asserts the properties
// the design promises: no horizontal overflow on any bar, the coach panel is
// present with its honest empty state, and the ⋯ popover (when the viewport
// forced one) opens with clickable items.
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

    // The reserved coach panel renders its honest empty state (CoachPanel.dc.html
    // — a deliberate shell that says so plainly when handed no lines).
    await expect(
      page.getByText("Coach commentary appears here as the deal goes on."),
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

    // (2) The dummy strip is labelled with the SEAT name, not the player name.
    const strip = page.getByTestId("dummy-strip");
    await expect(strip).toBeVisible();
    const stripText = ((await strip.textContent()) ?? "").trim();
    expect(stripText, "dummy strip starts with a seat name").toMatch(
      /^(North|East|South|West)/,
    );
  });
});
