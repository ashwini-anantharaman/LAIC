import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

// §7 access catalogue: the editor at /bridge/teams writes the single
// program-wide read model that gates nav + pages. This spec sorts FIRST
// alphabetically and shares the JSON store with every other spec, so it MUST
// leave the catalogue back at the built-in defaults — afterAll resets it even
// when a test fails.

const LIBRARY_LEARNER = 'input[name="page.library::bridge_learner"]';

test.describe.configure({ mode: "serial" });

/** Sign a fresh cookie in (each block clears the prior dev user first). */
async function switchUser(context: BrowserContext, devUserId: string): Promise<void> {
  await context.clearCookies();
  await signInAs(context, devUserId);
}

/** Reset the catalogue to defaults as an editor — accepts the confirm dialog. */
async function resetToDefaults(page: Page): Promise<void> {
  await page.context().clearCookies();
  await signInAs(page.context(), "user_orgadmin_olivia");
  await page.goto("/bridge/teams");
  const reset = page.getByRole("button", { name: "Reset to defaults" });
  if (await reset.count()) {
    page.once("dialog", (d) => d.accept());
    await reset.click();
    await expect(page.getByText("Access catalogue reset")).toBeVisible();
  }
}

test.describe("access catalogue editor", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await resetToDefaults(page);
    } finally {
      await page.close();
    }
  });

  test("the catalogue table renders and is editable for an org admin", async ({ page, context }) => {
    await switchUser(context, "user_orgadmin_olivia");
    await page.goto("/bridge/teams");

    await expect(page.getByRole("heading", { name: "Access catalogue" })).toBeVisible();
    // A defaults cell: learners see the Library page.
    await expect(page.locator(LIBRARY_LEARNER)).toBeChecked();
    await expect(page.locator(LIBRARY_LEARNER)).toBeEnabled();
    await expect(page.getByRole("button", { name: "Save catalogue" })).toBeVisible();
  });

  test("read-only for fellows", async ({ page, context }) => {
    await switchUser(context, "user_reviewer_rhea");
    await page.goto("/bridge/teams");

    await expect(page.getByRole("heading", { name: "Access catalogue" })).toBeVisible();
    await expect(page.locator(LIBRARY_LEARNER)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save catalogue" })).toHaveCount(0);
    await expect(page.getByText("Read-only — org or program admins can edit")).toBeVisible();
  });

  test("hiding a page takes effect for that role and only that role", async ({ page, context }) => {
    // Olivia hides the Library page from learners.
    await switchUser(context, "user_orgadmin_olivia");
    await page.goto("/bridge/teams");
    await page.locator(LIBRARY_LEARNER).uncheck();
    await page.getByRole("button", { name: "Save catalogue" }).click();
    await expect(page.getByText("Access catalogue saved")).toBeVisible();

    // Lena (learner): no Library nav link, and the page 404s.
    await switchUser(context, "user_learner_lena");
    await page.goto("/bridge/home");
    await expect(page.getByRole("link", { name: "Library" })).toHaveCount(0);
    await page.goto("/bridge/library");
    await expect(page.getByRole("heading", { name: "Library" })).toHaveCount(0);
    await expect(
      page.getByText(/could not be found|not found|404/i).first(),
    ).toBeVisible();

    // Rhea (fellow): Library untouched — the rule was learner-only.
    await switchUser(context, "user_reviewer_rhea");
    await page.goto("/bridge/library");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  });

  test("reset to defaults restores it", async ({ page, context }) => {
    await switchUser(context, "user_orgadmin_olivia");
    await page.goto("/bridge/teams");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(page.getByText("Access catalogue reset")).toBeVisible();

    // Lena sees the Library again: nav link back, page loads.
    await switchUser(context, "user_learner_lena");
    await page.goto("/bridge/home");
    await expect(page.getByRole("link", { name: "Library" }).first()).toBeVisible();
    await page.goto("/bridge/library");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  });

  test("test-access-catalogue compiles the set designer to the live matrix", async ({
    page,
    context,
  }) => {
    // Runs at defaults (the prior test reset), so the compiled matrix matches
    // the live catalogue exactly. Read-only experiment — nothing is applied,
    // so there is nothing to clean up.
    await switchUser(context, "user_orgadmin_olivia");
    await page.goto("/bridge/test-access-catalogue");

    await expect(
      page.getByRole("heading", { name: "Test access catalogue" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Compiles to" })).toBeVisible();
    await expect(page.getByText("Matches the live catalogue exactly.")).toBeVisible();

    // Drop learners from the Library capability set: all 6 library keys lose
    // learner, so 6 cells now differ from the live catalogue.
    await page.getByLabel("Library — Learner", { exact: true }).uncheck();
    await expect(
      page.getByText("6 cells differ from the live catalogue"),
    ).toBeVisible();
  });
});
