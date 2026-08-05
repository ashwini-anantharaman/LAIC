// The /m phone UI (2026-07-22): same data, same actions, phone chrome.
// Runs after kb.spec (alphabetical, one worker), so a compiled KB exists.

import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

test.use({ viewport: { width: 402, height: 874 } });

test("mobile lobby renders with the tab bar and deals via Quickplay", async ({
  page,
  context,
}) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto("/m/play");
  await expect(page.getByRole("heading", { name: "Take a seat" })).toBeVisible();
  // Tab bar present on the lobby.
  await expect(page.getByRole("link", { name: /Guide/ })).toBeVisible();

  // Deal a fresh board — quickPlayAction with mobile=1 lands on /m/table, which
  // now redirects to the one table experience (/bridge/table2; owner decision
  // 2026-07-30: the design-component table is the table on every screen size).
  await page.getByRole("button", { name: /Deal a fresh board|Quickplay/ }).click();
  await page.waitForURL(/\/bridge\/table2\/bs_/, { timeout: 30_000 });

  // The phone-tier table renders (its edge toolbar is present). The coach panel
  // is PARKED (owner 2026-08-05; page flag coachParked in table2 page), so it no
  // longer reserves space — its layer buttons are absent.
  // (The redirect leaves the /m shell for /bridge/table2, so the mobile tab bar
  //  no longer applies here — the single table wears the /bridge chrome.)
  await expect(page.getByTestId("edge-toolbar").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "What am I looking at?" }),
  ).toHaveCount(0);
});

test("mobile screens render real data", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto("/m/home");
  await expect(page.getByText(/Welcome back/)).toBeVisible();
  await page.goto("/m/players");
  await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();
  await page.goto("/m/library");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await page.goto("/m/guide");
  await expect(page.getByText("How it fits together")).toBeVisible();
});

test("mobile Quickplay lands on the one table — no BBO view or skin toggle", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto("/m/play");
  await page.getByRole("button", { name: /Deal a fresh board|Quickplay/ }).click();
  // /m/table redirects to the single table2 experience.
  await page.waitForURL(/\/bridge\/table2\/bs_/, { timeout: 30_000 });

  // The learner's table exposes no BBO-view switch and no skin toggle.
  await expect(page.getByRole("link", { name: "Switch to BBO view" })).toHaveCount(0);
  expect(page.url()).not.toContain("skin=");
  // The one table renders (edge toolbar present); the coach panel is parked, so
  // its layer buttons are absent (page flag coachParked in the table2 page).
  await expect(page.getByTestId("edge-toolbar").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "What am I looking at?" }),
  ).toHaveCount(0);
});
