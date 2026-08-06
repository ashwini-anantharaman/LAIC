// Folding nav on the play table (owner, 2026-08-05: "the navbar at the top
// should fold into something so it doesn't take up so much space at the top when
// playing"). On the phone tier a session-play route (/bridge/table2/<id>) starts
// COLLAPSED into one slim row — brand · page · a ☰ "Menu" button. Tapping Menu
// expands the full nav (the links, e.g. Library); navigating away restores the
// normal, always-open nav on non-table pages. The wide sidebar is unchanged and
// is not exercised here.
//
// Runs after kb.spec (alphabetical, workers=1) so the reviewer's quickplay works.

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

test.describe("folding nav — phone tier", () => {
  test("the table nav collapses to a Menu button, expands, and restores off-table", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");

    await page.setViewportSize(PHONE);
    await openTableSession(page);

    // Collapsed: the slim bar shows a ☰ "Menu" button and the nav links are
    // hidden (Library is not visible yet).
    // `exact` so this doesn't also match the table's own ☰ "Table menu" button.
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    await expect(menu).toBeVisible();
    const library = page.getByRole("link", { name: "Library" });
    await expect(library).toBeHidden();

    // Tapping Menu expands the full nav — the links become visible.
    await menu.click();
    await expect(library).toBeVisible();

    // Navigating away restores the normal nav: on a non-table page the links are
    // shown directly and there is no collapse (no Menu button).
    await library.click();
    await page.waitForURL(/\/bridge\/library/);
    await expect(page.getByRole("link", { name: "Library" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Menu", exact: true }),
    ).toHaveCount(0);
  });
});
