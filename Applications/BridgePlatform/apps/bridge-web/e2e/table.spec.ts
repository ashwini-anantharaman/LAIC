import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// §19.1 table play: deal a board, drive it to completion through the real
// UI, and check the Law 77 score + replay + progress wiring.

test("watch mode: deal, play to end, score and replay render", async ({ page, context }) => {
  await signInAs(context, "user_reviewer_rhea");
  await page.goto("/bridge/play");

  await page.locator('input[name="seed"]').first().fill("321");
  await page.locator('select[name="humanSeat"]').first().selectOption("watch");
  await page.getByRole("button", { name: "Deal a board" }).click();
  await expect(page).toHaveURL(/\/bridge\/play\/bs_/);

  await page.getByRole("button", { name: "Play to end" }).click();
  // Completion: the §8.2 score panel shows a result label.
  await expect(page.locator("text=/made|down|Passed out/").first()).toBeVisible();

  await page.getByRole("link", { name: "Replay step-by-step →" }).click();
  await expect(page).toHaveURL(/\/replay/);
  await expect(page.locator("text=/step \\d+ of \\d+/")).toBeVisible();
  await page.getByRole("link", { name: "⏮ Start" }).click();
  await expect(page.locator("text=step 0 of")).toBeVisible();
});

test("human seat: make calls and plays through the UI to completion", async ({ page, context }) => {
  await signInAs(context, "user_learner_lena");
  await page.goto("/bridge/play");

  await page.locator('input[name="seed"]').first().fill("7");
  await page.locator('select[name="humanSeat"]').first().selectOption("S");
  await page.getByRole("button", { name: "Deal a board" }).click();
  await expect(page).toHaveURL(/\/bridge\/play\/bs_/);

  // Drive the board: bid box -> Pass; my play turn -> first legal card;
  // otherwise advance the AI. Each click is a server action that re-renders
  // the table — settle before deciding the next move, or we double-submit
  // against stale DOM.
  const done = page.locator("text=/made \\+?|down \\d|Passed out/").first();
  for (let i = 0; i < 120 && !(await done.isVisible()); i++) {
    const passButton = page.getByRole("button", { name: "Pass", exact: true });
    const legalCard = page.locator("button.border-emerald-400:enabled").first();
    const advance = page.getByRole("button", { name: "Advance AI" });
    // Short-timeout clicks: a re-render between isVisible and click just
    // means this iteration is a no-op and the loop looks again.
    if (await passButton.isVisible()) await passButton.click({ timeout: 4000 }).catch(() => {});
    else if (await legalCard.isVisible()) await legalCard.click({ timeout: 4000 }).catch(() => {});
    else if (await advance.isVisible()) await advance.click({ timeout: 4000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(100);
  }
  await expect(done).toBeVisible();

  // The human actions feed the §13.6 evidence layer: progress renders with
  // package-derived skill attribution (§13.5).
  await page.goto("/bridge/progress");
  await expect(page.locator("text=By skill").or(page.locator("text=No signals yet"))).toBeVisible();
});
