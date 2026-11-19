import { expect, type Page, test } from "@playwright/test";
import {
  db,
  devUserId,
  expectBotReactsToHover,
  FIXTURES,
  seedFixtures,
  signIn,
} from "./fixtures";

test.describe("your bots", () => {
  test.beforeAll(seedFixtures);

  test("shows each submission with its status", async ({ page }) => {
    await signIn(page, "/my-bots");
    const card = (name: string) =>
      page.getByTestId("submission").filter({ hasText: name });

    await expect(card(FIXTURES.alpha.name)).toHaveAttribute(
      "data-status",
      "listed",
    );
    await expect(card(FIXTURES.pending.name)).toHaveAttribute(
      "data-status",
      "pending",
    );
    await expect(card(FIXTURES.declined.name)).toHaveAttribute(
      "data-status",
      "declined",
    );
    // Declined submitters see the reviewer's note.
    await expect(card(FIXTURES.declined.name)).toContainText(
      FIXTURES.declined.note,
    );
    // Listed bots link to their public page; others don't.
    await expect(
      card(FIXTURES.alpha.name).getByRole("link", {
        name: FIXTURES.alpha.name,
      }),
    ).toHaveAttribute("href", `/bots/${FIXTURES.alpha.slug}`);
    await expect(
      card(FIXTURES.pending.name).getByRole("link", {
        name: FIXTURES.pending.name,
      }),
    ).toHaveCount(0);
  });

  test("filters by status", async ({ page }) => {
    await signIn(page, "/my-bots");
    await page.getByRole("tab", { name: /^Declined/ }).click();
    await expect(page).toHaveURL("/my-bots?status=declined");
    const cards = page.getByTestId("submission");
    await expect(
      cards.filter({ hasText: FIXTURES.declined.name }),
    ).toBeVisible();
    await expect(cards.filter({ hasText: FIXTURES.alpha.name })).toHaveCount(0);
  });

  test("submission bots run on the engine", async ({ page }) => {
    await signIn(page, "/my-bots");
    const card = page
      .getByTestId("submission")
      .filter({ hasText: FIXTURES.pending.name });
    await expectBotReactsToHover(card, card.getByTestId("card-bot"));
  });
});

test.describe("managing your own bots", () => {
  test.beforeEach(seedFixtures);
  test.afterAll(seedFixtures);

  const card = (page: Page, name: string) =>
    page.getByTestId("submission").filter({ hasText: name });

  test("a member takes their listed bot out of the directory", async ({
    page,
    request,
  }) => {
    await signIn(page, "/my-bots");
    const alpha = card(page, FIXTURES.alpha.name);
    await alpha.getByTestId("remove-bot").click();
    // Asked twice, and Cancel leaves it be.
    await alpha.getByRole("button", { name: "Cancel" }).click();
    await expect(alpha).toHaveAttribute("data-status", "listed");
    await alpha.getByTestId("remove-bot").click();
    await alpha.getByRole("button", { name: "Yes, remove" }).click();

    await expect(alpha).toHaveAttribute("data-status", "unlisted");
    await expect(alpha.getByTestId("submission-status")).toHaveText("Removed");
    await expect(alpha).toContainText("Removed by you");
    await expect(
      alpha.getByRole("link", { name: "Submit again" }),
    ).toBeVisible();
    // Gone from the directory, and logged as the owner's own doing.
    expect((await request.get(`/bots/${FIXTURES.alpha.slug}`)).status()).toBe(
      404,
    );
    await page.goto("/");
    await expect(
      page.getByTestId("bot-row").filter({ hasText: FIXTURES.alpha.name }),
    ).toHaveCount(0);
    const { data: events } = await db()
      .from("grok_bot_moderation_events")
      .select("action, actor_id, reason")
      .eq("bot_slug", FIXTURES.alpha.slug)
      .order("id", { ascending: false })
      .limit(1);
    expect(events?.[0]).toMatchObject({
      action: "unlist",
      actor_id: await devUserId(),
      reason: "Removed by its owner",
    });
  });

  test("a member withdraws a bot that's still in review", async ({ page }) => {
    await signIn(page, "/my-bots");
    const pending = card(page, FIXTURES.pending.name);
    await pending.getByTestId("remove-bot").click();
    await pending.getByRole("button", { name: "Yes, withdraw" }).click();
    await expect(pending).toHaveAttribute("data-status", "unlisted");
    await expect(pending.getByTestId("submission-status")).toHaveText(
      "Removed",
    );
  });

  test("a bot an admin unlisted isn't the member's to put back", async ({
    page,
  }) => {
    await db()
      .from("grok_bots")
      .update({ status: "unlisted", review_note: "No longer shared." })
      .eq("slug", FIXTURES.alpha.slug);
    await signIn(page, "/my-bots");
    const alpha = card(page, FIXTURES.alpha.name);
    await expect(alpha.getByTestId("submission-status")).toHaveText("Unlisted");
    await expect(alpha.getByRole("link", { name: "Submit again" })).toHaveCount(
      0,
    );
    await expect(alpha.getByTestId("remove-bot")).toHaveCount(0);
  });

  test("a member chooses the name their bots are credited to", async ({
    page,
  }) => {
    await signIn(page, "/my-bots");
    // The pending fixture carries a name from its share card.
    const choice = page.getByTestId("credit-choice");
    await expect(choice).toContainText(FIXTURES.pending.author);
    await choice
      .getByRole("button", { name: "Show Local Dev instead" })
      .click();
    await expect(choice).toContainText("credited to your profile, Local Dev");
    const { data } = await db()
      .from("grok_bots")
      .select("creator_name")
      .eq("slug", FIXTURES.pending.slug)
      .single();
    expect(data?.creator_name).toBeNull();
  });

  test("a removed bot can be sent back, credited as its owner chose", async ({
    page,
  }) => {
    test.skip(!process.env.E2E_NETWORK, "needs network (E2E_NETWORK=1)");
    // A real shared bot, so x.ai answers for it. It names its author.
    const REAL = { slug: "e2e-real-share", shareId: "BlzS2Llj7_9VSmi3TjX0r" };
    const row = async () =>
      (
        await db()
          .from("grok_bots")
          .select("status, creator_name")
          .eq("slug", REAL.slug)
          .single()
      ).data;
    const { error } = await db()
      .from("grok_bots")
      .insert({
        slug: REAL.slug,
        share_id: REAL.shareId,
        name: "Quill Real Share",
        description: "A fixture with a real share link.",
        avatar_shape: "cloud",
        avatar_color: "blue",
        category: "operations",
        status: "listed",
        source: "submission",
        owner_id: await devUserId(),
        ai_review_status: "safe",
      });
    if (error) throw error;
    // Only this one is live, so the choice below is about it alone.
    await db()
      .from("grok_bots")
      .update({ status: "declined" })
      .in("slug", [FIXTURES.alpha.slug, FIXTURES.pending.slug]);

    await signIn(page, "/my-bots");
    const choice = page.getByTestId("credit-choice");
    await expect(choice).toContainText("credited to your profile");
    await choice
      .getByRole("button", { name: "Use the name on the share card" })
      .click();
    await expect(choice).toContainText("the name on their share card", {
      timeout: 20_000,
    });
    const named = (await row())?.creator_name;
    expect(named).toBeTruthy();

    await choice
      .getByRole("button", { name: "Show Local Dev instead" })
      .click();
    await expect(choice).toContainText("credited to your profile");
    expect((await row())?.creator_name).toBeNull();

    const real = card(page, "Quill Real Share");
    await real.getByTestId("remove-bot").click();
    await real.getByRole("button", { name: "Yes, remove" }).click();
    await expect(real.getByTestId("submission-status")).toHaveText("Removed");
    await real.getByRole("link", { name: "Submit again" }).click();

    await expect(page.getByTestId("submit-preview")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("already-submitted")).toContainText(
      "You removed this bot",
    );
    // Their choice holds for what they submit next.
    await expect(page.getByTestId("preview-author")).toContainText(
      "Shared by you",
    );
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect
      .poll(async () => (await row())?.status, { timeout: 20_000 })
      .toBe("pending");
    expect((await row())?.creator_name).toBeNull();
  });

  test("a marketplace bot goes to its creator when their X handle matches", async ({
    page,
  }) => {
    // Two bots imported from the marketplace, owned by nobody here: one
    // credited to the local member's X handle, one to somebody else's.
    const market = (slug: string, handle: string) => ({
      slug,
      share_id: `${slug}-share`,
      name:
        slug === "e2e-market-mine"
          ? "Quill Market Mine"
          : "Quill Market Theirs",
      description: "Imported from the official marketplace.",
      avatar_shape: "cloud",
      avatar_color: "blue",
      category: "operations",
      status: "listed",
      source: "marketplace",
      creator_name: "Zephyr Maker",
      creator_x_handle: handle,
      ai_review_status: "safe",
    });
    const { error } = await db()
      .from("grok_bots")
      .insert([
        market("e2e-market-mine", "Zephyr_Dev"),
        market("e2e-market-theirs", "Somebody_Else"),
      ]);
    if (error) throw error;
    const me = await devUserId();
    // Their handle as X gave it, in another capitalisation than the card's.
    await db().from("users").update({ x_handle: "zephyr_dev" }).eq("id", me);
    try {
      await signIn(page, "/my-bots");
      const mine = card(page, "Quill Market Mine");
      await expect(mine).toHaveAttribute("data-status", "listed");
      await expect(card(page, "Quill Market Theirs")).toHaveCount(0);
      const { data: rows } = await db()
        .from("grok_bots")
        .select("slug, owner_id")
        .in("slug", ["e2e-market-mine", "e2e-market-theirs"])
        .order("slug");
      expect(rows).toEqual([
        { slug: "e2e-market-mine", owner_id: me },
        { slug: "e2e-market-theirs", owner_id: null },
      ]);
      // It's on their profile now.
      await page.goto("/u/zephyr_dev");
      await expect(page.getByTestId("creator-profile")).toContainText(
        "Quill Market Mine",
      );

      // They can take it out of this directory; the marketplace keeps it.
      await page.goto("/my-bots");
      await mine.getByTestId("remove-bot").click();
      await expect(mine.getByTestId("remove-confirm")).toContainText(
        "It stays on the official Marketplace.",
      );
      await mine.getByRole("button", { name: "Yes, remove" }).click();
      await expect(mine.getByTestId("submission-status")).toHaveText("Removed");
    } finally {
      await db().from("users").update({ x_handle: null }).eq("id", me);
    }
  });

  test("Refresh brings a listing up to date with the bot on x.ai", async ({
    page,
  }) => {
    test.skip(!process.env.E2E_NETWORK, "needs network (E2E_NETWORK=1)");
    // The changed card is reviewed for real, which can take a minute.
    test.setTimeout(120_000);
    // A real shared bot whose listing has gone stale, and one whose share
    // link leads nowhere.
    const base = {
      avatar_shape: "cloud",
      avatar_color: "blue",
      category: "operations",
      status: "listed",
      source: "submission",
      owner_id: await devUserId(),
      ai_review_status: "safe",
    };
    const { error } = await db()
      .from("grok_bots")
      .insert([
        {
          ...base,
          slug: "e2e-refresh-real",
          share_id: "BlzS2Llj7_9VSmi3TjX0r",
          name: "Quill Stale Name",
          description: "What the bot said before it was edited.",
        },
        {
          ...base,
          slug: "e2e-refresh-gone",
          share_id: "e2eNoSuchShare0000000",
          name: "Quill Gone Bot",
          description: "Its share link leads nowhere.",
        },
      ]);
    if (error) throw error;

    await signIn(page, "/my-bots");
    // Found by its listing link: the name on the card is what changes.
    const stale = page.getByTestId("submission").filter({
      has: page.locator('a[href="/bots/e2e-refresh-real"]'),
    });
    await expect(stale).toContainText("Quill Stale Name");
    await stale.getByTestId("refresh-bot").click();
    await expect(stale.getByTestId("refresh-result")).toHaveText(
      "Updated from x.ai.",
      { timeout: 70_000 },
    );
    const { data: row } = await db()
      .from("grok_bots")
      .select("name, description, status, avatar_shape")
      .eq("slug", "e2e-refresh-real")
      .single();
    expect(row?.status).toBe("listed");
    expect(row?.name).not.toBe("Quill Stale Name");
    expect(row?.description).not.toContain("before it was edited");
    // The card shows the bot's real name now; a second press finds nothing.
    await expect(stale).toContainText(row?.name ?? "");
    await expect(stale).not.toContainText("Quill Stale Name");
    await stale.getByTestId("refresh-bot").click();
    await expect(stale.getByTestId("refresh-result")).toHaveText(
      "Already up to date.",
      { timeout: 20_000 },
    );

    // A bot that's no longer shared: its owner is told, and decides.
    const gone = card(page, "Quill Gone Bot");
    await gone.getByTestId("refresh-bot").click();
    await expect(gone.getByTestId("refresh-result")).toContainText(
      "isn’t shared publicly on x.ai any more",
      { timeout: 20_000 },
    );
    await expect(gone).toHaveAttribute("data-status", "listed");
  });

  test("the scheduled refresh only runs for the scheduler", async ({
    request,
  }) => {
    const res = await request.get("/api/cron/refresh-bots");
    expect(res.status()).toBe(401);
  });
});
