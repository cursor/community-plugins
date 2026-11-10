import { expect, test } from "@playwright/test";
import { APP_FIXTURES, seedFixtures, signIn } from "./fixtures";

test.describe("apps", () => {
  test.beforeAll(seedFixtures);

  test("the Apps tab lists official apps before community apps", async ({
    page,
  }) => {
    await page.goto("/?tab=apps");
    await expect(page.getByRole("tab", { name: "Apps" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("textbox", { name: "Search apps" }).fill("Zephyr App");
    const official = page.getByTestId("official-apps");
    const community = page.getByTestId("community-apps");
    await expect(
      official.getByTestId("app-row").filter({
        hasText: APP_FIXTURES.official.name,
      }),
    ).toBeVisible();
    await expect(
      community.getByTestId("app-row").filter({
        hasText: APP_FIXTURES.community.name,
      }),
    ).toBeVisible();
    // Not listed yet, Cursor-only, or marked as not working in Grok Bot.
    for (const f of [
      APP_FIXTURES.pending,
      APP_FIXTURES.cursorOnly,
      APP_FIXTURES.notInGrokBot,
    ]) {
      await expect(
        page.getByTestId("app-row").filter({ hasText: f.name }),
      ).toHaveCount(0);
    }
  });

  test("an official app adds to Grok Bot from its marketplace page", async ({
    page,
  }) => {
    await page.goto(`/apps/${APP_FIXTURES.official.slug}`);
    await expect(
      page.getByRole("heading", { name: APP_FIXTURES.official.name }),
    ).toBeVisible();
    await expect(page.getByTestId("official-badge")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add to Grok Bot" }),
    ).toHaveAttribute(
      "href",
      `https://x.ai/bot/plugin/${APP_FIXTURES.official.marketplaceId}`,
    );
  });

  test("a community app shows how to set up its MCP server", async ({
    page,
  }) => {
    await page.goto(`/apps/${APP_FIXTURES.community.slug}`);
    await expect(page.getByTestId("official-badge")).toHaveCount(0);
    const server = page.getByTestId("setup-server");
    await expect(server).toContainText("zephyr-community");
    await expect(server).toContainText(APP_FIXTURES.community.serverUrl);
    await expect(page.getByText("zephyr-notes")).toBeVisible();
  });

  test("apps that aren't listed in the directory 404", async ({ page }) => {
    for (const f of [
      APP_FIXTURES.pending,
      APP_FIXTURES.cursorOnly,
      APP_FIXTURES.notInGrokBot,
    ]) {
      const res = await page.goto(`/apps/${f.slug}`);
      expect(res?.status()).toBe(404);
    }
  });

  test("your submissions include your apps", async ({ page }) => {
    await signIn(page, "/my-bots");
    const card = (name: string) =>
      page
        .getByTestId("submission")
        .filter({ hasText: name })
        .and(page.locator('[data-kind="app"]'));
    await expect(card(APP_FIXTURES.community.name)).toHaveAttribute(
      "data-status",
      "listed",
    );
    await expect(card(APP_FIXTURES.pending.name)).toHaveAttribute(
      "data-status",
      "pending",
    );
    await expect(card(APP_FIXTURES.cursorOnly.name)).toHaveCount(0);
  });

  test("the app form checks a pasted MCP server URL before submitting", async ({
    page,
  }) => {
    await signIn(page, "/submit?kind=app");
    await expect(
      page.getByRole("heading", { name: "Submit an app" }),
    ).toBeVisible();
    const submit = page.getByRole("button", { name: "Submit for review" });
    await page
      .getByLabel("GitHub repository or MCP server URL")
      .fill("https://mcp.example.com/another");
    await expect(submit).toBeDisabled();
    await page.getByLabel("Name").fill("Zephyr Draft");
    await page
      .getByLabel("Description")
      .fill("Checks the form without submitting it.");
    await expect(page.getByTestId("app-preview")).toContainText("Zephyr Draft");
    await expect(submit).toBeEnabled();
  });
});
