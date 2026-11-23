import { expect, test } from "@playwright/test";
import { APP_FIXTURES, db, seedFixtures, signIn } from "./fixtures";

test.describe("apps", () => {
  test.beforeAll(seedFixtures);

  test("the Apps tab lists official and community apps in one list", async ({
    page,
  }) => {
    await page.goto("/?tab=apps");
    await expect(page.getByRole("tab", { name: "Apps" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("textbox", { name: "Search apps" }).fill("Zephyr App");
    const list = page.getByTestId("apps-list");
    const official = list
      .getByTestId("app-row")
      .filter({ hasText: APP_FIXTURES.official.name });
    const community = list
      .getByTestId("app-row")
      .filter({ hasText: APP_FIXTURES.community.name });
    await expect(official).toBeVisible();
    await expect(community).toBeVisible();
    // Only the official one is marked.
    await expect(official.getByTestId("row-official-badge")).toHaveText(
      "Official",
    );
    await expect(community.getByTestId("row-official-badge")).toHaveCount(0);
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

  test("apps sort by Trending, Top and New, by their installs", async ({
    page,
  }) => {
    // Far more installs than anything seeded; the fixture is new, so they
    // all count as recent.
    const { error } = await db()
      .from("plugins")
      .update({ install_count: 987_654 })
      .eq("slug", APP_FIXTURES.community.slug);
    if (error) throw error;

    await page.goto("/?tab=apps");
    const list = page.getByTestId("apps-list");
    await expect(list.getByRole("heading", { level: 2 })).toContainText(
      "Trending apps",
    );
    // It leads Trending and shows its count.
    const first = list.getByTestId("app-row").first();
    await expect(first).toContainText(APP_FIXTURES.community.name);
    await expect(first.locator(".metric")).toHaveText("988k");

    const sorts = list.getByRole("tablist", { name: "Sort apps" });
    await sorts.getByRole("tab", { name: "Top" }).click();
    await expect(list.getByRole("heading", { level: 2 })).toContainText(
      "Most installed",
    );
    await expect(list.getByTestId("app-row").first()).toContainText(
      APP_FIXTURES.community.name,
    );

    // New goes by listing date: the fixtures were seeded a moment ago.
    await sorts.getByRole("tab", { name: "New" }).click();
    await expect(list.getByRole("heading", { level: 2 })).toContainText(
      "New apps",
    );
    await expect(list.getByTestId("app-row").first()).toContainText(
      /Zephyr App/,
    );
    await expect(
      list.getByTestId("app-row").first().locator(".metric"),
    ).toHaveText("today");
    await seedFixtures();
  });

  test("adding an app counts as an install of the plugin", async ({
    page,
    context,
  }) => {
    // The Add link leaves for x.ai in a new tab; the count is what matters.
    await context.route("https://x.ai/**", (route) => route.abort());
    const installs = async () => {
      const { data } = await db()
        .from("plugins")
        .select("install_count")
        .eq("slug", APP_FIXTURES.official.slug)
        .single();
      return data?.install_count ?? 0;
    };
    const before = await installs();
    await page.goto(`/apps/${APP_FIXTURES.official.slug}`);
    const popup = page.waitForEvent("popup");
    // The page's own Add, not the ones on the related rows below it.
    await page.locator(".detail-actions").getByTestId("app-add").click();
    await (await popup).close();
    await expect.poll(installs).toBe(before + 1);
  });

  test("the Apps tab arrives with the first rows and fetches the rest once, behind them", async ({
    page,
  }) => {
    // The page carries the first rows; every app (/api/apps) follows in the
    // background, once, for search, categories and Show more.
    const fetches: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/apps") fetches.push(r.url());
    });
    await page.goto("/?tab=apps&category=PRODUCTIVITY");
    await expect(
      page.getByRole("button", { name: "Productivity" }),
    ).toHaveAttribute("aria-pressed", "true");
    const list = page.getByTestId("apps-list");
    const total = Number(
      (await list.locator(".section-count").textContent()) ?? "0",
    );
    const rows = list.getByTestId("app-row");
    await expect(rows).toHaveCount(Math.min(total, 60));
    await expect.poll(() => fetches.length).toBe(1);

    // Another category is filtered in the browser: the URL follows, and
    // neither the page nor the list is fetched again.
    const pages: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("_rsc=") && new URL(r.url()).pathname === "/")
        pages.push(r.url());
    });
    await page.getByRole("button", { name: "Payments" }).click();
    await expect(page).toHaveURL(/category=PAYMENTS/);
    await expect(
      page.getByRole("button", { name: "Payments" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("apps-pending")).toHaveCount(0);
    expect(fetches).toHaveLength(1);
    expect(pages).toHaveLength(0);

    // Show more comes from the same list. The seeded marketplace has more
    // than a page of apps; a bare database doesn't, and has no button.
    await page.goto("/?tab=apps");
    const all = Number(
      (await list.locator(".section-count").textContent()) ?? "0",
    );
    test.skip(all <= 60, "needs more than one page of apps");
    await list.getByRole("button", { name: /^Show more/ }).click();
    await expect(rows).toHaveCount(Math.min(all, 120));
    expect(fetches).toHaveLength(2);
  });

  test("switching between Bots and Apps asks the server for nothing", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("bot-row").first()).toBeVisible();
    const pages: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("_rsc=") && new URL(r.url()).pathname === "/")
        pages.push(r.url());
    });
    const tabs = page.getByRole("tablist", { name: "Directory" });

    await tabs.getByRole("tab", { name: "Apps" }).click();
    await expect(page).toHaveURL(/\?tab=apps$/);
    await expect(page.getByTestId("app-row").first()).toBeVisible();
    await expect(page.getByTestId("bot-row").first()).toBeHidden();
    await expect(page).toHaveTitle(/^Apps for Grok Bot/);
    await expect(
      page.getByRole("link", { name: "Submit an app" }).first(),
    ).toBeVisible();

    // The header's links switch the same way, and Back returns.
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Bots", exact: true })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("bot-row").first()).toBeVisible();
    await expect(page.getByTestId("app-row").first()).toBeHidden();
    await page.goBack();
    await expect(page.getByTestId("app-row").first()).toBeVisible();

    expect(pages).toHaveLength(0);
    // Nothing stands in for rows while they load, anywhere on the page.
    await expect(page.locator(".skeleton-rows, .sk")).toHaveCount(0);
  });

  test("an official app adds to Grok Bot from its marketplace page", async ({
    page,
  }) => {
    await page.goto(`/apps/${APP_FIXTURES.official.slug}`);
    await expect(
      page.getByRole("heading", { name: APP_FIXTURES.official.name }),
    ).toBeVisible();
    await expect(page.getByTestId("official-badge")).toBeVisible();
    await expect(page.getByTestId("community-app-notice")).toHaveCount(0);
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
    // It says who made it and what the scan can't see, and links to more.
    const notice = page.getByTestId("community-app-notice");
    await expect(notice).toContainText("not by the Grok Bot team");
    await expect(
      notice.getByRole("link", { name: "Before you add an app" }),
    ).toHaveAttribute("href", "/about#adding");
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

  test("an app page lists others in its category, never itself", async ({
    page,
  }) => {
    // Both lead Productivity, so each would head its own list if the page
    // didn't leave its own app out.
    for (const [slug, installs] of [
      [APP_FIXTURES.official.slug, 987_654],
      [APP_FIXTURES.community.slug, 987_653],
    ] as const) {
      const { error } = await db()
        .from("plugins")
        .update({ install_count: installs, app_category: "PRODUCTIVITY" })
        .eq("slug", slug);
      if (error) throw error;
    }
    for (const [own, other] of [
      [APP_FIXTURES.official, APP_FIXTURES.community],
      [APP_FIXTURES.community, APP_FIXTURES.official],
    ] as const) {
      await page.goto(`/apps/${own.slug}`);
      const related = page.locator(".related");
      await expect(related.getByRole("heading", { level: 2 })).toHaveText(
        "More in Productivity",
      );
      const rows = related.getByTestId("app-row");
      await expect(rows.first()).toContainText(other.name);
      await expect(rows.filter({ hasText: own.name })).toHaveCount(0);
      expect(await rows.count()).toBeLessThanOrEqual(3);
    }
    await seedFixtures();
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

  test("the bulk import job only runs for the scheduler", async ({
    request,
  }) => {
    const res = await request.get("/api/cron/import-apps");
    expect(res.status()).toBe(401);
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

  test("an owner's new website shows at once; a new name goes back through the check", async ({
    page,
  }) => {
    const row = async () => {
      const { data } = await db()
        .from("plugins")
        .select("id, name, homepage, active, scan_status")
        .eq("slug", APP_FIXTURES.community.slug)
        .single();
      return data;
    };
    const card = page
      .getByTestId("submission")
      .filter({ hasText: "Zephyr App Community" });

    await signIn(page, "/my-bots");
    await card.getByTestId("edit-app").click();
    await expect(page).toHaveURL(`/apps/${APP_FIXTURES.community.slug}/edit`);
    const save = page.getByRole("button", { name: /^Save/ });
    await expect(save).toBeDisabled();
    await page.getByLabel("Website").fill("https://zephyr.test/home");
    await expect(page.getByTestId("recheck-notice")).toHaveCount(0);
    await expect(save).toHaveText("Save");
    await save.click();
    await expect(page).toHaveURL(/\/my-bots\?submitted=/);
    await expect(card).toHaveAttribute("data-status", "listed");
    expect(await row()).toMatchObject({
      homepage: "https://zephyr.test/home",
      active: true,
      scan_status: "safe",
    });

    // A new name is what the scan would judge, so the app waits for it.
    await card.getByTestId("edit-app").click();
    await page.getByLabel("Name").fill("Zephyr App Community Renamed");
    await expect(page.getByTestId("recheck-notice")).toBeVisible();
    await page.getByRole("button", { name: "Save and re-check" }).click();
    await expect(page).toHaveURL(/\/my-bots\?submitted=/);
    await expect(card).toHaveAttribute("data-status", "pending");
    await expect(card).toContainText("Security check running");
    await expect(card.getByTestId("edit-app")).toHaveCount(0);
    const after = await row();
    expect(after).toMatchObject({
      name: "Zephyr App Community Renamed",
      active: false,
      scan_status: "pending",
    });
    // Its address is the same, and admins can see who changed what.
    const { data: events } = await db()
      .from("plugin_moderation_events")
      .select("action, reason")
      .eq("plugin_id", after?.id)
      .order("id", { ascending: false })
      .limit(2);
    expect(events).toEqual([
      { action: "owner_edit", reason: "Changed its name" },
      { action: "owner_edit", reason: "Changed its website" },
    ]);
    // While it waits there's nothing to edit.
    const res = await page.goto(`/apps/${APP_FIXTURES.community.slug}/edit`);
    expect(res?.status()).toBe(404);
    await seedFixtures();
  });

  test("an app can't take another listing's name", async ({ page }) => {
    await signIn(page, `/apps/${APP_FIXTURES.community.slug}/edit`);
    await page.getByLabel("Name").fill(APP_FIXTURES.legacy.name.toUpperCase());
    await page.getByRole("button", { name: "Save and re-check" }).click();
    await expect(page.getByTestId("edit-error")).toHaveText(
      "Another listing already has that name.",
    );
    const { data } = await db()
      .from("plugins")
      .select("name, active")
      .eq("slug", APP_FIXTURES.community.slug)
      .single();
    expect(data).toEqual({ name: APP_FIXTURES.community.name, active: true });
  });

  test("a repository's app takes its name and description from the repository", async ({
    page,
  }) => {
    await signIn(page, `/apps/${APP_FIXTURES.repo.slug}/edit`);
    await expect(page.getByLabel("Name")).toBeDisabled();
    await expect(page.getByLabel("Description")).toBeDisabled();
    await expect(
      page.getByTestId("from-repo").getByRole("link"),
    ).toHaveAttribute("href", APP_FIXTURES.repo.repository);
    // Its website is the owner's to set.
    await page.getByLabel("Website").fill("https://zephyr.test/repo");
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("only its owner can edit an app", async ({ page }) => {
    // Signed out, the page asks for a sign-in first.
    await page.goto(`/apps/${APP_FIXTURES.community.slug}/edit`);
    await expect(page).toHaveURL(/\/login\?next=/);
    // Signed in, someone else's app (this one has no owner) isn't there.
    await signIn(page, "/my-bots");
    const res = await page.goto(`/apps/${APP_FIXTURES.legacy.slug}/edit`);
    expect(res?.status()).toBe(404);
  });

  test("Refresh reads an app's server again, and changes nothing when it's offline", async ({
    page,
  }) => {
    await signIn(page, "/my-bots");
    const card = (name: string) =>
      page.getByTestId("submission").filter({ hasText: name });
    // Offered where there's a source to read: one server, or a repository.
    await expect(
      card(APP_FIXTURES.repo.name).getByTestId("refresh-app"),
    ).toBeVisible();
    await expect(
      card(APP_FIXTURES.community.name).getByTestId("refresh-app"),
    ).toHaveCount(0);
    // The fixture's server doesn't exist.
    const server = card(APP_FIXTURES.server.name);
    await server.getByTestId("refresh-app").click();
    await expect(server.getByTestId("refresh-result")).toContainText(
      "Couldn’t connect to the server",
      { timeout: 30_000 },
    );
    await expect(server).toHaveAttribute("data-status", "listed");
    const { data } = await db()
      .from("plugins")
      .select("active, scan_status")
      .eq("slug", APP_FIXTURES.server.slug)
      .single();
    expect(data).toEqual({ active: true, scan_status: "safe" });
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
