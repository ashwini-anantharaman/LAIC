import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// §19.1 admin loop: run a generation, inspect the run (diff, §19.3 coverage),
// and see the action land in the §21 audit trail.

test("generation run: diff, test coverage, audit trail", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");

  await page.goto("/bridge/admin/runs");
  await page.getByRole("button", { name: "Run generation" }).click();
  await expect(page).toHaveURL(/\/bridge\/admin\/runs\/run_/);
  await expect(page.locator("text=/Diff vs/")).toBeVisible();
  await expect(page.locator("text=Affected tests (§19.3)")).toBeVisible();
  await expect(page.locator("text=/This version is immutable/")).toBeVisible();

  await page.goto("/bridge/admin/audit");
  await expect(page.locator("text=generation.run").first()).toBeVisible();
});

test("knowledge browser: item shows tags and provenance", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto("/bridge/admin/knowledge/ki_bn_open_major");
  await expect(page.locator("text=Where this rule comes from")).toBeVisible();
  await expect(page.locator("text=/Skills:.*Hand evaluation/")).toBeVisible();
});
