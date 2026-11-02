import { expect, test } from "@playwright/test";
import { expectBotReactsToHover, FIXTURES } from "./fixtures";

test.describe("directory", () => {
  test("lists bots and searches them through the URL", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("hero-bot")).toBeVisible();
    await expect(page.getByTestId("bot-row").first()).toBeVisible();

    await page
      .getByPlaceholder("Search by creator or bot name")
      .fill("Zephyr Fixture");
    await expect(page).toHaveURL(/q=Zephyr/);
    const rows = page.getByTestId("bot-row");
    await expect(rows.filter({ hasText: FIXTURES.alpha.name })).toBeVisible();
    await expect(rows.filter({ hasText: FIXTURES.beta.name })).toBeVisible();
    // Pending and declined bots never reach the public list.
    await expect(rows.filter({ hasText: FIXTURES.pending.name })).toHaveCount(
      0,
    );
    await expect(rows.filter({ hasText: FIXTURES.declined.name })).toHaveCount(
      0,
    );

    await page.getByRole("button", { name: /Recruiting & People/ }).click();
    await expect(page).toHaveURL(/category=recruiting-people/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(FIXTURES.beta.name);

    // The filters survive a reload because they live in the URL.
    await page.reload();
    await expect(rows).toHaveCount(1);
  });

  test("shows add counts only from five adds up", async ({ page }) => {
    await page.goto("/?q=Zephyr%20Fixture");
    const row = (name: string) =>
      page.getByTestId("bot-row").filter({ hasText: name });
    await expect(row(FIXTURES.alpha.name).locator(".metric")).toHaveText("12");
    await expect(row(FIXTURES.beta.name).locator(".metric")).toHaveText("");
    // The empty count keeps the Add buttons lined up.
    const addX = async (name: string) =>
      (await row(name).getByTestId("add-button").boundingBox())?.x;
    expect(await addX(FIXTURES.beta.name)).toBe(
      await addX(FIXTURES.alpha.name),
    );

    await page.goto(`/bots/${FIXTURES.alpha.slug}`);
    await expect(page.getByTestId("install-count")).toHaveText("12 adds");
    await page.goto(`/bots/${FIXTURES.beta.slug}`);
    await expect(page.getByTestId("install-count")).toHaveCount(0);
  });

  test("shows an empty state when nothing matches", async ({ page }) => {
    await page.goto("/?q=qqzzxxnomatchqq");
    await expect(page.getByTestId("empty-state")).toContainText(
      'No bots found for "qqzzxxnomatchqq"',
    );
  });

  test("row bots look up and cheer on hover", async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent(FIXTURES.alpha.name)}`);
    const row = page
      .getByTestId("bot-row")
      .filter({ hasText: FIXTURES.alpha.name });
    await expectBotReactsToHover(row, row.getByTestId("row-bot"));
  });

  test("opens a bot's page from its row", async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent(FIXTURES.beta.name)}`);
    await page
      .getByTestId("bot-row")
      .filter({ hasText: FIXTURES.beta.name })
      .click();
    await expect(page).toHaveURL(`/bots/${FIXTURES.beta.slug}`);
    await expect(
      page.getByRole("heading", { level: 1, name: FIXTURES.beta.name }),
    ).toBeVisible();
    await expect(page.getByText(FIXTURES.beta.description)).toBeVisible();
    await expect(page.getByTestId("detail-bot")).toBeVisible();
    await expect(page.getByTestId("add-button").first()).toBeVisible();
  });

  test("bot pages carry share metadata", async ({ page }) => {
    await page.goto(`/bots/${FIXTURES.alpha.slug}`);
    await expect(page).toHaveTitle(new RegExp(FIXTURES.alpha.name));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/bots/${FIXTURES.alpha.slug}$`),
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      new RegExp(`/bots/${FIXTURES.alpha.slug}/opengraph-image`),
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  });

  test("unlisted and unknown bots show the not-found page", async ({
    page,
  }) => {
    for (const slug of [FIXTURES.pending.slug, "e2e-does-not-exist"]) {
      await page.goto(`/bots/${slug}`);
      await expect(
        page.getByText("This page doesn’t exist, or the bot isn’t listed."),
      ).toBeVisible();
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
        "content",
        /noindex/,
      );
    }
  });
});
