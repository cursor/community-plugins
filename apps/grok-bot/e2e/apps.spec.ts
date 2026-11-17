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

  test("the Apps tab arrives with the first rows and loads the rest on demand", async ({
    page,
  }) => {
    // Every app is only fetched (from /api/apps) to search or show more.
    const fetches: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/apps") fetches.push(r.url());
    });
    await page.goto("/?tab=apps&category=PRODUCTIVITY");
    await expect(
      page.getByRole("button", { name: "Productivity" }),
    ).toHaveAttribute("aria-pressed", "true");
    const official = page.getByTestId("official-apps");
    const total = Number(
      (await official.locator(".section-count").textContent()) ?? "0",
    );
    const rows = official.getByTestId("app-row");
    await expect(rows).toHaveCount(Math.min(total, 60));
    expect(fetches).toHaveLength(0);

    // Another category comes from the server too, still without every app.
    await page.getByRole("button", { name: "Payments" }).click();
    await expect(page).toHaveURL(/category=PAYMENTS/);
    await expect(
      page.getByRole("button", { name: "Payments" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(fetches).toHaveLength(0);

    // Show more needs the rest. The seeded marketplace has more than a page
    // of official apps; a bare database doesn't, and has no button.
    await page.goto("/?tab=apps");
    const all = Number(
      (await official.locator(".section-count").textContent()) ?? "0",
    );
    test.skip(all <= 60, "needs more than one page of official apps");
    await official.getByRole("button", { name: /^Show more/ }).click();
    await expect(rows).toHaveCount(Math.min(all, 120));
    expect(fetches).toHaveLength(1);
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

  test("a community app adds to Grok Bot through a prefilled message", async ({
    page,
  }) => {
    await page.goto(`/apps/${APP_FIXTURES.community.slug}`);
    await expect(page.getByTestId("official-badge")).toHaveCount(0);
    // Add opens Grok Bot with a message for its AddMcpServer tool.
    const add = page.getByRole("link", { name: "Add to Grok Bot" });
    const href = new URL((await add.getAttribute("href")) ?? "");
    expect(href.origin + href.pathname).toBe(
      "https://cursor.com/grok-bot/link/v1/prompt",
    );
    // Its server, then its skill from the copy the directory serves.
    const text = href.searchParams.get("text") ?? "";
    expect(text).toContain(
      `Add the MCP server ${APP_FIXTURES.community.serverUrl} (call it "zephyr-community").`,
    );
    expect(text).toMatch(
      new RegExp(
        `Add the skill "zephyr-notes" from https?://\\S+/apps/${APP_FIXTURES.community.slug}/skills/zephyr-notes/SKILL\\.md \\(fetch it and save it as a skill\\)\\.$`,
      ),
    );
    // What's inside lists its server (with the tools it reported and its
    // sign-in) and its skill.
    await expect(page.getByText("zephyr-community")).toBeVisible();
    await expect(page.getByText("zephyr_search")).toBeVisible();
    await expect(page.getByTestId("requires-sign-in")).toBeVisible();
    await expect(page.getByText("zephyr-notes")).toBeVisible();
  });

  test("an older community app adds from the config in its install link", async ({
    page,
  }) => {
    await page.goto(`/apps/${APP_FIXTURES.legacy.slug}`);
    const add = page.getByRole("link", { name: "Add to Grok Bot" });
    const text =
      new URL((await add.getAttribute("href")) ?? "").searchParams.get(
        "text",
      ) ?? "";
    expect(text).toBe(
      `Add the local MCP server "zephyr-legacy" that runs: npx -y zephyr-legacy-mcp. It needs the ZEPHYR_API_KEY environment variable; ask me for the value.`,
    );
  });

  test("lists a community app's skills for messages too long to name each", async ({
    request,
  }) => {
    const res = await request.get(
      `/apps/${APP_FIXTURES.community.slug}/skills.md`,
    );
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(
      new RegExp(
        `- zephyr-notes: https?://\\S+/apps/${APP_FIXTURES.community.slug}/skills/zephyr-notes/SKILL\\.md`,
      ),
    );
    expect(
      (
        await request.get(`/apps/${APP_FIXTURES.legacy.slug}/skills.md`)
      ).status(),
    ).toBe(404);
  });

  test("serves a community app's skill as SKILL.md", async ({ request }) => {
    const res = await request.get(
      `/apps/${APP_FIXTURES.community.slug}/skills/zephyr-notes/SKILL.md`,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/markdown");
    expect(await res.text()).toBe(
      '---\nname: "zephyr-notes"\ndescription: "Writes meeting notes."\n---\n\nWrite meeting notes from the transcript the user shares.\n',
    );
    const missing = await request.get(
      `/apps/${APP_FIXTURES.community.slug}/skills/nope/SKILL.md`,
    );
    expect(missing.status()).toBe(404);
  });

  test("apps that aren't listed in the directory 404", async ({ page }) => {
    for (const f of [
      APP_FIXTURES.pending,
      APP_FIXTURES.cursorOnly,
      APP_FIXTURES.notInGrokBot,
      APP_FIXTURES.notAddable,
    ]) {
      const res = await page.goto(`/apps/${f.slug}`);
      expect(res?.status()).toBe(404);
    }
  });

  test("an app Grok Bot can't add isn't listed", async ({ request }) => {
    const apps = (await (await request.get("/api/apps")).json()) as {
      slug: string;
    }[];
    const slugs = apps.map((a) => a.slug);
    expect(slugs).toContain(APP_FIXTURES.community.slug);
    expect(slugs).toContain(APP_FIXTURES.legacy.slug);
    expect(slugs).not.toContain(APP_FIXTURES.notAddable.slug);
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

  test("the app form only accepts a URL that answers as an MCP server", async ({
    page,
  }) => {
    await signIn(page, "/submit?kind=app");
    await expect(
      page.getByRole("heading", { name: "Submit an app" }),
    ).toBeVisible();
    const submit = page.getByRole("button", { name: "Submit for review" });
    // A private address is refused before anything is fetched.
    await page
      .getByLabel("GitHub repository or MCP server URL")
      .fill("https://127.0.0.1/mcp");
    await expect(
      page.getByText("Use the server’s public https://"),
    ).toBeVisible();
    await page.getByLabel("Name").fill("Zephyr Draft");
    await page
      .getByLabel("Description")
      .fill("Checks the form without submitting it.");
    await expect(submit).toBeDisabled();
  });

  // Connects to a real public MCP server, so it only runs with E2E_NETWORK=1.
  // It previews the server and stops before submitting.
  test("pasting an MCP server URL fills in what the server reports", async ({
    page,
  }) => {
    test.skip(!process.env.E2E_NETWORK, "needs network (E2E_NETWORK=1)");
    await signIn(page, "/submit?kind=app");
    await page
      .getByLabel("GitHub repository or MCP server URL")
      .fill("https://mcp.deepwiki.com/mcp");
    await expect(page.getByLabel("Name")).toHaveValue("DeepWiki", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("app-preview-meta")).toContainText(
      "ask_wiki_question",
    );
    await page
      .getByLabel("Description")
      .fill("Ask questions about any public GitHub repository.");
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeEnabled();
  });
});
