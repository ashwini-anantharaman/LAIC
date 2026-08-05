// Table coach — PARKED (owner, 2026-08-05: "for now, hide the coach panel").
// The coach engine and its wiring are intact (lib/coach, CoachPanel, the
// table.coach access key, /api/bridge/play-hint) but the panel is not rendered:
// the page forces it off via `coachParked` in
//   app/bridge/table2/[sessionId]/page.tsx
// This spec is the tripwire for that parked state — it asserts the panel is
// ABSENT while the table (its ☰ toolbar) still works. WHEN THE COACH IS
// RE-ENABLED (flip coachParked to false), restore the populated-panel assertions
// from git history for this file.
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

test.describe("table coach — parked", () => {
  test("the coach panel is absent while the table still renders", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");

    await page.setViewportSize(PHONE);
    await openTableSession(page);

    // The table itself is live — its edge toolbars (with the ☰ Table menu) render.
    await expect(page.getByTestId("edge-toolbar").first()).toBeVisible();

    // The coach panel is not rendered at all — neither its layer buttons nor its
    // honest empty-state line appear (absent, not merely empty). The dealt HCP
    // facts line, the coach's tell, is likewise gone.
    await expect(
      page.getByRole("button", { name: "What am I looking at?" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Help me think" })).toHaveCount(0);
    await expect(
      page.getByText("Coach commentary appears here as the deal goes on."),
    ).toHaveCount(0);
  });
});
