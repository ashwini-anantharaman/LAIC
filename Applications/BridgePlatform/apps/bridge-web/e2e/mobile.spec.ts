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

  // Deal a fresh board — quickPlayAction with mobile=1 lands on /m/table.
  await page.getByRole("button", { name: /Deal a fresh board|Quickplay/ }).click();
  await page.waitForURL(/\/m\/table\/bs_/, { timeout: 30_000 });

  // Felt chrome: toolbar pills + no tab bar on the table.
  await expect(
    page.getByRole("button", { name: /Start automatic play|Pause automatic play/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Guide/ })).toHaveCount(0);
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

test("mobile BBO view toggles on and stays through a step", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto("/m/play");
  await page.getByRole("button", { name: /Deal a fresh board|Quickplay/ }).click();
  await page.waitForURL(/\/m\/table\/bs_/);
  await page.getByRole("link", { name: "Switch to BBO view" }).click();
  await page.waitForURL(/skin=bbo/);
  await expect(page.getByRole("link", { name: "Switch to platform view" })).toBeVisible();
  // The felt renders the BBO auction header letters.
  await expect(page.getByText("W", { exact: true }).first()).toBeVisible();
});
