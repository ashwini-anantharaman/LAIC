import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// The hidden component tester at /bridge/component-tester. Gated by
// page.component_tester (ADMIN defaults), so an admin-area user (Rhea, a
// fellow/reviewer) sees it and a learner (Lena) 404s. Every Inspect cell is a
// real deterministic session (fixed board seed 7); Build views are LAYOUT-ONLY
// and live in localStorage (per-origin, isolated per test context here).

const ADMIN = "user_reviewer_rhea";
const ROUTE = "/bridge/component-tester";

test.describe("component tester", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await signInAs(context, ADMIN);
    // Build views live in localStorage (per-origin); start every test from a
    // clean library so saved-view counts are deterministic.
    await page.goto(ROUTE);
    await page.evaluate(() => localStorage.clear());
  });

  // ── Inspect mode (default) ──────────────────────────────────────────────────
  test("loads with the left-rail groups and a default cell", async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText("Component tester").first()).toBeVisible();
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
    const styles = await bodies.evaluateAll((els) => els.map((e) => e.getAttribute("style") ?? ""));
    expect(new Set(styles).size).toBe(5);
  });

  test("URL is the source of truth — an explicit query drives every control", async ({ page }) => {
    await page.goto(
      `${ROUTE}?comp=AuctionBox&axis=single&role=declarer&moment=midPlay&skin=noir&seat=E&hand=fan&pad=columns&density=compact&live=1&prole=bridge_coach`,
    );
    await expect(page.getByText("AuctionBox").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /AuctionBox/ })).toHaveAttribute("data-active", "1");
    await expect(page.getByRole("button", { name: "Declarer", exact: true, pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fan", exact: true, pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Suit columns", exact: true, pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Compact", exact: true, pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Live", exact: true, pressed: true })).toBeVisible();
  });

  // ── Build mode ──────────────────────────────────────────────────────────────
  test("Build tab opens with a preset laid out on the canvas", async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await expect(page.getByTestId("canvas").first()).toBeVisible();
    // The default preset (Table 3×3) places the four seat diagrams.
    await expect(page.getByTestId("canvas-cell").first()).toBeVisible();
    expect(await page.getByTestId("canvas-cell").count()).toBeGreaterThan(0);
  });

  test("adding a component from the palette appends a chip and a canvas cell", async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByRole("button", { name: "Blank", exact: true }).click();
    await expect(page.getByTestId("canvas-cell")).toHaveCount(0);

    await page.getByTestId("palette-SeatPlate").click();
    await expect(page.getByTestId("canvas-cell")).toHaveCount(1);
    // A slot chip for the new component appears (seat N is the first free seat).
    await expect(page.getByRole("button", { name: "Seat plate N", exact: true })).toBeVisible();
  });

  test("selecting a slot shows its Show-in group and toggling changes the cell DOM", async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByRole("button", { name: "Blank", exact: true }).click();

    // Adding auto-selects the slot; N is the dealer, so its plate shows DEALER.
    await page.getByTestId("palette-SeatPlate").click();
    await expect(page.getByText("Show in Seat plate")).toBeVisible();
    const dealerMark = page.getByTestId("canvas-cell").getByText("DEALER");
    await expect(dealerMark).toBeVisible();

    // The "Dealer mark" toggle is wired to a real prop — flipping it changes the DOM.
    await page.getByRole("button", { name: "Dealer mark", exact: true }).click();
    await expect(dealerMark).toHaveCount(0);
  });

  test("saving a view persists it across a reload (localStorage)", async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByRole("button", { name: "Blank", exact: true }).click();
    await page.getByTestId("palette-SeatDiagram").click();

    await page.getByLabel("View name").fill("persist-view");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("saved-view").getByText("persist-view")).toBeVisible();

    await page.reload();
    // Rehydrated from localStorage after the reload.
    await expect(page.getByTestId("saved-view").getByText("persist-view")).toBeVisible();
  });

  test("duplicate and delete work on saved views", async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByRole("button", { name: "Blank", exact: true }).click();
    await page.getByTestId("palette-SeatDiagram").click();
    await page.getByLabel("View name").fill("dup-view");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("saved-view")).toHaveCount(1);

    await page.getByRole("button", { name: "Duplicate dup-view" }).click();
    await expect(page.getByTestId("saved-view")).toHaveCount(2);
    await expect(page.getByTestId("saved-view").getByText("dup-view copy")).toBeVisible();

    await page.getByRole("button", { name: "Delete dup-view copy" }).click();
    await page.getByRole("button", { name: "Delete dup-view", exact: true }).click();
    await expect(page.getByTestId("saved-view")).toHaveCount(0);
  });

  test("Preview as student hides the editing rails", async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole("button", { name: "Build", exact: true }).click();
    // The left rail's palette section is present while editing.
    await expect(page.getByText("Add to view")).toBeVisible();

    await page.getByTestId("student-toggle").click();
    // Editing chrome is gone; the canvas remains.
    await expect(page.getByText("Add to view")).toHaveCount(0);
    await expect(page.getByTestId("canvas").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to editing" })).toBeVisible();
  });

  test("a learner 404s on the hidden route", async ({ page, context }) => {
    await context.clearCookies();
    await signInAs(context, "user_learner_lena");
    await page.goto(ROUTE);
    await expect(page.getByText("Component tester").first()).toHaveCount(0);
    await expect(page.getByText(/could not be found|not found|404/i).first()).toBeVisible();
  });
});
