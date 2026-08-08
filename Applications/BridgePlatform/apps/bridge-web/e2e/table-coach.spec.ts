// Table coach (phase-2 transplant — his engine, our shell). With the table.coach
// feature on (mirror-today: every role), the phone-tier table2 reserves the
// CoachPanel region and fills it with his LAYERED content the moment a seated
// learner has a board: the facts layer ("What I'm looking at") shows on load,
// and tapping "Help me think" swaps in his reasoning scaffold. Quickplay seats
// the signed-in user at South, so lookingAt/thinkAid have a hand to reason from.
//
// Runs after kb.spec (alphabetical, workers=1) so the reviewer's quickplay works.

import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

const PHONE = { width: 390, height: 844 };

/** Open a fresh table2 session via the Play landing quickplay flow (seats South). */
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

test.describe("table coach — phone tier", () => {
  test("the coach region fills with real content and a layer button produces lines", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");

    await page.setViewportSize(PHONE);
    await openTableSession(page);

    // Seated South, the coach is NOT its honest empty state — the facts layer is
    // showing, with at least one reading of the position (HCP from the dealt
    // hand always appears in the facts line).
    await expect(
      page.getByText("Coach commentary appears here as the deal goes on."),
    ).toHaveCount(0);
    await expect(page.getByText(/HCP/).first()).toBeVisible();

    // His three layer buttons are the panel's actions.
    await expect(page.getByRole("button", { name: "What am I looking at?" })).toBeVisible();
    const think = page.getByRole("button", { name: "Help me think" });
    await expect(think).toBeVisible();
    await expect(
      page.getByRole("button", { name: /What should I (bid|play)\?/ }),
    ).toBeVisible();

    // Tapping "Help me think" swaps the facts layer for his reasoning scaffold —
    // deterministic, no network — whose "What you can work out" section always
    // carries at least one worked-out fact for a seated learner.
    await think.click();
    await expect(page.getByText("What you can work out")).toBeVisible();
  });
});
