import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// The hidden component tester at /bridge/component-tester. Gated by
// page.component_tester (ADMIN defaults), so an admin-area user (Rhea, a
// fellow/reviewer) sees it and a learner (Lena) 404s. Every cell is a real
// deterministic session (fixed board seed 7), so these flows are stable.
//
// Serial: the save-a-view test writes the shared JSON store, so it runs in
// order and deletes what it created — the suite ends state-neutral.

test.describe.configure({ mode: "serial" });

const ADMIN = "user_reviewer_rhea";
const ROUTE = "/bridge/component-tester";

test.describe("component tester", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await signInAs(context, ADMIN);
  });

  test("loads with the left-rail groups and a default cell", async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText("Component tester").first()).toBeVisible();
    // Grouped component list + the default component row.
    await expect(page.getByRole("button", { name: /SeatHand/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /AuctionBox/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /PlayTable/ })).toBeVisible();
    // Single axis → exactly one cell.
    await expect(page.getByTestId("cell-body")).toHaveCount(1);
  });

  test("BidColumns + Compare Role renders the five game-role cells", async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole("button", { name: /BidColumns/ }).click();
    await page.getByRole("button", { name: "Role", exact: true }).click();

    await expect(page.getByTestId("cell-body")).toHaveCount(5);
    const labels = await page.getByTestId("cell-label").allInnerTexts();
    expect(labels).toEqual(["Player", "Declarer", "Dummy", "Kibitzer", "Director"]);
  });

  test("Compare Skin renders five cells with different backdrops", async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Skin", exact: true }).click();

    const bodies = page.getByTestId("cell-body");
    await expect(bodies).toHaveCount(5);
    // Each cell's felt-flat backdrop is its skin's — the style attributes differ.
    const styles = await bodies.evaluateAll((els) => els.map((e) => e.getAttribute("style") ?? ""));
    expect(new Set(styles).size).toBe(5);
  });

  test("URL is the source of truth — an explicit query drives every control", async ({ page }) => {
    await page.goto(
      `${ROUTE}?comp=AuctionBox&axis=single&role=declarer&moment=midPlay&skin=noir&seat=E&hand=fan&pad=columns&density=compact&live=1&prole=bridge_coach`,
    );
    // Canvas heading reflects the chosen component.
    await expect(page.getByText("AuctionBox").first()).toBeVisible();
    // Left-rail AuctionBox row is the active one.
    await expect(page.getByRole("button", { name: /AuctionBox/ })).toHaveAttribute("data-active", "1");
    // Right-rail toggles reflect the query.
    await expect(page.getByRole("button", { name: "Declarer", exact: true, pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fan", exact: true, pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Suit columns", exact: true, pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Compact", exact: true, pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Live", exact: true, pressed: true })).toBeVisible();
  });

  test("save a view, see it listed, open it, then delete it", async ({ page }) => {
    await page.goto(ROUTE);
    // Put the grid in a distinctive state.
    await page.getByRole("button", { name: /AuctionBox/ }).click();
    await page.getByRole("button", { name: "Moment", exact: true }).click();

    await page.getByLabel("View name").fill("e2e-view");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const saved = page.getByRole("button", { name: "e2e-view", exact: true });
    await expect(saved).toBeVisible();

    // Opening it navigates to its encoded URL.
    await saved.click();
    await expect(page).toHaveURL(/comp=AuctionBox/);
    await expect(page).toHaveURL(/axis=moment/);

    // Clean up — the suite must end state-neutral.
    await page.getByRole("button", { name: "Delete e2e-view" }).click();
    await expect(page.getByRole("button", { name: "e2e-view", exact: true })).toHaveCount(0);
  });

  test("a learner 404s on the hidden route", async ({ page, context }) => {
    await context.clearCookies();
    await signInAs(context, "user_learner_lena");
    await page.goto(ROUTE);
    await expect(page.getByText("Component tester").first()).toHaveCount(0);
    await expect(page.getByText(/could not be found|not found|404/i).first()).toBeVisible();
  });
});
