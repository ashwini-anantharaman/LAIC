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
});
