import { expect, type Page, test } from "@playwright/test";
import { FIXTURES, seedFixtures, signIn } from "./fixtures";

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("mobile", () => {
  test.beforeAll(seedFixtures);

  test("pages fit the screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("bot-row").first()).toBeVisible();
    await expectNoSideScroll(page);

    await page.goto(`/bots/${FIXTURES.alpha.slug}`);
    await expect(page.getByTestId("detail-bot")).toBeVisible();
    await expectNoSideScroll(page);

    await signIn(page, "/my-bots");
    await expect(page.getByTestId("submission").first()).toBeVisible();
    await expectNoSideScroll(page);

    // On a phone the hint wraps to two lines and the error to one; the
    // error must still take the hint's place without moving the page.
    await page.goto("/submit");
    const field = page.locator(".field");
    const bottom = () =>
      field.evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
    const before = await bottom();
    await page
      .getByLabel("Share link", { exact: true })
      .fill("https://example.com/x");
    await page.getByLabel("Share link", { exact: true }).blur();
    await expect(page.locator("#share-help")).toHaveText(/Paste a Grok Bot/);
    expect(await bottom()).toBe(before);
  });
});
