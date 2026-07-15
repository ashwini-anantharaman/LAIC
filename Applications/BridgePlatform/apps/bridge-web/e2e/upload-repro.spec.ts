import { expect, test } from "@playwright/test";

test.use({ baseURL: "https://bridge-platform-gules.vercel.app" });

test("upload the real SP3 PDF on prod", async ({ page, context }) => {
  await context.addCookies([
    { name: "bridge_dev_user", value: "user_reviewer_rhea", url: "https://bridge-platform-gules.vercel.app" },
  ]);
  await page.goto("/bridge/kb/kb_mrldk80k001/sources");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles("/Users/aryan/Downloads/SP3 (bk) single pages.pdf");
  page.on("response", (r) => {
    if (r.request().method() === "POST")
      console.log("POST", r.status(), r.statusText());
  });
  await page.getByRole("button", { name: /Upload document|Replace document/ }).first().click();
  await page.waitForTimeout(10_000);
  console.log("PAGE TEXT:", (await page.locator("body").innerText()).slice(0, 400));
});
