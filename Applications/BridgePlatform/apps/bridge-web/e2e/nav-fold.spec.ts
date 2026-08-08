// Folding nav (owner, 2026-08-05: "the navbar at the top should fold into
// something so it doesn't take up so much space at the top when playing";
// 2026-08-08: "the top tool bar should always be collapsed in mobile view").
// On the phone tier EVERY bridge page is one slim row — brand · page · a ☰
// "Menu" button — and the link list only drops down when ☰ is tapped. Following
// a link folds it back up behind the new page. The wide sidebar is unchanged
// and is not exercised here.
//
// Runs after kb.spec (alphabetical, workers=1) so the reviewer's quickplay works.

import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

const PHONE = { width: 390, height: 844 };

/** A nav link, scoped to the fold-away menu — pages carry links of their own. */
function navLink(page: Page, name: string) {
  return page.locator("#bridge-nav-menu").getByRole("link", { name, exact: true });
}

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
  test("every page starts collapsed, ☰ expands, and following a link folds it back", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");
    await page.setViewportSize(PHONE);

    // An ordinary page: collapsed on arrival — the ☰ is there, the links aren't.
    // `exact` so this doesn't also match the table's own ☰ "Table menu" button.
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    await page.goto("/bridge/home");
    await expect(menu).toBeVisible();
    await expect(navLink(page, "Library")).toBeHidden();

    // Tapping ☰ drops the list down.
    await menu.click();
    await expect(navLink(page, "Library")).toBeVisible();

    // Following a link navigates AND folds the menu back up.
    await navLink(page, "Library").click();
    await page.waitForURL(/\/bridge\/library/);
    await expect(menu).toBeVisible();
    await expect(navLink(page, "Library")).toBeHidden();

    // The table — the route the fold was built for — behaves the same.
    await openTableSession(page);
    await expect(menu).toBeVisible();
    await expect(navLink(page, "Library")).toBeHidden();
  });
});
