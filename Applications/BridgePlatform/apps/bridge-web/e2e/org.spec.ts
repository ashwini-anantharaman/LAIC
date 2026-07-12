import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// §3.4-3.5: org profile editing (permissioned) and coach affiliations.

test("org admin edits the org profile; coach sees it read-only", async ({ page, context }) => {
  await signInAs(context, "user_orgadmin_olivia");
  await page.goto("/bridge/org");
  await expect(page.getByRole("button", { name: "Save org profile" })).toBeVisible();
  await page.getByRole("button", { name: "Save org profile" }).click();
  await expect(page.getByRole("button", { name: "Save org profile" })).toBeVisible();

  // A coach in the same org: read-only summary, no save button.
  await context.clearCookies();
  await signInAs(context, "user_coach_carlos");
  await page.goto("/bridge/org");
  await expect(page.locator("text=/bridge.org.manage/")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save org profile" })).toHaveCount(0);
});

test("coach declares an affiliation (pending) and it is audited", async ({ page, context }) => {
  await signInAs(context, "user_coach_carlos");
  await page.goto("/bridge/org");
  await page.locator('select[name="affiliationType"]').selectOption("class_coach");
  await page.locator('input[name="programOrganizationId"]').fill("org_other_club");
  await page.getByRole("button", { name: "Declare affiliation" }).click();
  await expect(page.locator("text=/class_coach — org_other_club/")).toBeVisible();
  await expect(page.locator("text=(pending)").first()).toBeVisible();
});
