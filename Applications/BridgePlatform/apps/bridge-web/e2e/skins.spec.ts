import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

// Skins & appearance configurator (2026-08). The staged look at /bridge/skins
// persists per-user, and the table2 ☰ reads the same saved appearance, so this
// spec MUST leave the test user back at the built-in defaults — afterAll resets
// it even when a test fails. Sorts after kb.spec (serial) alphabetically, which
// is fine: it uses its own dev user and cleans up after itself.

const USER = "user_learner_lena";

test.describe.configure({ mode: "serial" });

/** Sign the test user in, clearing any prior dev cookie first. */
async function signIn(page: Page): Promise<void> {
  await page.context().clearCookies();
  await signInAs(page.context(), USER);
}

/** Stage the built-in defaults and save them, so the store is left pristine. */
async function resetToDefaults(page: Page): Promise<void> {
  await signIn(page);
  await page.goto("/bridge/skins");
  await page.getByRole("button", { name: "Reset to skin defaults" }).click();
  await page.getByRole("button", { name: "Save appearance" }).click();
  await expect(page.getByText("Appearance saved")).toBeVisible();
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

test.describe("skins & appearance configurator", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await resetToDefaults(page);
    } finally {
      await page.close();
    }
  });

  test("the page loads for a default user with presets, the 5-skin gallery and a preview", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/bridge/skins");

    await expect(page.getByRole("heading", { name: "Skins & appearance" })).toBeVisible();
    // Presets, including the reference "Classic club" bundle.
    await expect(page.getByRole("button", { name: "Classic club" })).toBeVisible();
    // Exactly the five skins in the gallery.
    await expect(page.getByTestId("skin-card")).toHaveCount(5);
    // The live preview is present.
    await expect(page.getByTestId("skins-preview")).toBeVisible();
    // Defaults: row hand + grid pad, no frame.
    await expect(page.getByTestId("preview-hand-row")).toBeVisible();
    await expect(page.getByTestId("preview-bidpad-grid")).toBeVisible();
  });

  test("the Classic club preset flips the staged toggles and re-dresses the preview", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/bridge/skins");

    await page.getByRole("button", { name: "Classic club" }).click();

    // The controls now read Fan / Suit columns / frame On.
    await expect(page.getByRole("button", { name: "Fan", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Suit columns", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "On", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The preview reacts: the fanned hand and suit-column pad appear, and the
    // gold centre frame wraps the felt.
    await expect(page.getByTestId("preview-hand-fan")).toBeVisible();
    await expect(page.getByTestId("preview-bidpad-columns")).toBeVisible();
    await expect(page.getByTestId("preview-frame")).toBeVisible();
    // A concrete fan marker: cards carry a rotate() transform.
    const transform = await page
      .locator('[data-fan-card="1"]')
      .first()
      .evaluate((el) => getComputedStyle(el).transform);
    expect(transform).not.toBe("none");
  });

  test("saving persists the staged look across a reload", async ({ page }) => {
    await signIn(page);
    await page.goto("/bridge/skins");

    // Stage the fanned Classic club look and save it.
    await page.getByRole("button", { name: "Classic club" }).click();
    await page.getByRole("button", { name: "Save appearance" }).click();
    await expect(page.getByText("Appearance saved")).toBeVisible();

    // A fresh load initialises the staged state from the saved appearance:
    // fan is still on.
    await page.goto("/bridge/skins");
    await expect(page.getByRole("button", { name: "Fan", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("preview-hand-fan")).toBeVisible();
  });

  test("the table2 ☰ exposes the appearance rows and the Skin row cycles", async ({ page }) => {
    // The learner user cannot quickplay (no visible KB compiles), so this test
    // rides the reviewer's proven flow from kb.spec. Their appearance must end
    // where it started — kb.spec asserts the default felt for this user.
    await page.context().clearCookies();
    await signInAs(page.context(), "user_reviewer_rhea");

    await openTableSession(page);

    await page.getByRole("button", { name: "Table menu" }).click();
    await expect(page.getByText("Table settings")).toBeVisible();

    // The appearance rows exist.
    const skinRow = page.getByRole("button", { name: /Skin/ }).first();
    await expect(skinRow).toBeVisible();
    await expect(page.getByRole("button", { name: /Hand layout/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Bid pad/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Centre frame/ })).toBeVisible();
    // The Appearance row is an href row — SettingsMenu renders those as
    // router-driven buttons, not anchors. It no longer leaves for /bridge/skins:
    // it opens the WHOLE configurator as an overlay on this same board.
    await page.getByRole("button", { name: /Appearance/ }).click();
    await expect(page.getByRole("heading", { name: "Appearance & skins" })).toBeVisible();
    await expect(page.getByTestId("preset-card").first()).toBeVisible();
    await expect(page).toHaveURL(/appearance=1/);
    // Close is a plain link back to the board, configurator gone. The ☰ menu
    // is client state and never closed — both moves were router navigations —
    // so it is simply still there for the rows below.
    await page.getByRole("link", { name: "✕ Close" }).click();
    await expect(page.getByRole("heading", { name: "Appearance & skins" })).toHaveCount(0);
    await expect(page.getByText("Table settings")).toBeVisible();

    // Skin cycles bbo → midnight: Green baize → Midnight.
    await expect(skinRow).toContainText("Green baize");
    await skinRow.click();
    await expect(page.getByRole("button", { name: /Skin/ }).first()).toContainText("Midnight");

    // Cycle the rest of the way around so the reviewer is left on the default
    // skin: Midnight → Parchment → Noir → Claret → Green baize.
    for (const label of ["Parchment", "Noir", "Claret", "Green baize"]) {
      await page.getByRole("button", { name: /Skin/ }).first().click();
      await expect(page.getByRole("button", { name: /Skin/ }).first()).toContainText(label);
    }

    // The fan works on the PHONE tier too (Mobile Table.dc.html): flip Hand
    // layout to Fan, shrink to a phone-tier viewport, and the South hand's
    // cards carry the fan's rotate transform.
    const handRow = page.getByRole("button", { name: /Hand layout/ });
    await handRow.click();
    await expect(page.getByRole("button", { name: /Hand layout/ })).toContainText("Fan");
    await page.setViewportSize({ width: 900, height: 1250 });
    await page.mouse.click(750, 900); // backdrop — close the menu
    await expect(page.getByText("Table settings")).toHaveCount(0);
    const fanCard = page.locator('button[aria-label^="Play"][style*="rotate("]').first();
    await expect(fanCard).toBeVisible();

    // Leave the reviewer on Row so this spec is state-neutral end to end.
    await page.getByRole("button", { name: "Table menu" }).click();
    await page.getByRole("button", { name: /Hand layout/ }).click();
    await expect(page.getByRole("button", { name: /Hand layout/ })).toContainText("Row");
  });
});
