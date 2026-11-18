import { expect, test } from "@playwright/test";
import {
  APP_FIXTURES,
  DEV_EMAIL,
  db,
  devUserId,
  FIXTURES,
  seedFixtures,
  signIn,
} from "./fixtures";

// The dev user owns one listed bot (alpha) and one listed app (community),
// plus a pending bot, a declined bot, and a flagged and a pending app.
const profileOf = async () => {
  const { data } = await db()
    .from("users")
    .select("slug, x_handle")
    .eq("id", await devUserId())
    .single();
  return data as { slug: string; x_handle: string | null };
};

// A second fixture member, who has submitted a bot that isn't listed.
const QUIET_EMAIL = "e2e-quiet@grok-bot.local";

async function memberWithNothingListed(): Promise<{ slug: string }> {
  const admin = db();
  const { data: list, error } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (error) throw error;
  let id = list.users.find((u) => u.email === QUIET_EMAIL)?.id;
  if (!id) {
    const created = await admin.auth.admin.createUser({
      email: QUIET_EMAIL,
      password: "local-dev-only-password",
      email_confirm: true,
      user_metadata: { name: "E2E Quiet Member" },
    });
    if (created.error) throw created.error;
    id = created.data.user.id;
  }
  // Fixture bots go by the "e2e-" slug prefix, so seeding clears this one.
  const { error: botError } = await admin.from("grok_bots").upsert(
    {
      slug: "e2e-zephyr-quiet",
      name: "Zephyr Fixture Quiet",
      description: "Still in review.",
      share_id: "e2eFixtureQuiet01",
      avatar_shape: "blob",
      avatar_color: "blue",
      category: "operations",
      status: "pending",
      source: "submission",
      owner_id: id,
    },
    { onConflict: "slug" },
  );
  if (botError) throw botError;
  const { data } = await admin
    .from("users")
    .select("slug")
    .eq("id", id)
    .single();
  return data as { slug: string };
}

test.describe("profiles", () => {
  test.beforeEach(async () => {
    await seedFixtures();
    await db()
      .from("users")
      .update({ x_handle: null, public: true })
      .eq("id", await devUserId());
  });

  test.afterAll(async () => {
    await db()
      .from("users")
      .update({ x_handle: null, public: true })
      .eq("id", await devUserId());
    await seedFixtures();
  });

  test("lists a creator's listed bots and apps, and nothing else", async ({
    page,
  }) => {
    const { slug } = await profileOf();
    await page.goto(`/u/${slug}`);
    const profile = page.getByTestId("creator-profile");
    await expect(profile.getByRole("heading", { level: 1 })).toHaveText(
      "Local Dev",
    );
    // A local database can hold other listings of the dev user's too.
    await expect(page.getByTestId("creator-counts")).toHaveText(
      /^\d+ bots? · \d+ apps?$/,
    );
    await expect(
      profile.getByTestId("bot-row").filter({ hasText: FIXTURES.alpha.name }),
    ).toHaveCount(1);
    await expect(
      profile
        .getByTestId("app-row")
        .filter({ hasText: APP_FIXTURES.community.name }),
    ).toHaveCount(1);
    // Nothing unlisted, and nothing private.
    const text = await page.locator("body").innerText();
    for (const hidden of [
      FIXTURES.pending.name,
      FIXTURES.declined.name,
      APP_FIXTURES.flagged.name,
      APP_FIXTURES.pending.name,
      APP_FIXTURES.notAddable.name,
      DEV_EMAIL,
    ])
      expect(text).not.toContain(hidden);
    expect(await page.content()).not.toContain(DEV_EMAIL);
  });

  test("an author's name on a card and on a bot's page opens their profile", async ({
    page,
  }) => {
    const { slug } = await profileOf();
    await page.goto("/");
    const row = page
      .getByTestId("bot-row")
      .filter({ hasText: FIXTURES.alpha.name });
    await row.getByTestId("creator-link").click();
    await expect(page).toHaveURL(new RegExp(`/u/${slug}$`));
    await expect(page.getByTestId("creator-profile")).toBeVisible();

    await page.goto(`/bots/${FIXTURES.alpha.slug}`);
    await page.getByTestId("creator-link").first().click();
    await expect(page).toHaveURL(new RegExp(`/u/${slug}$`));
  });

  test("someone who signed in with X goes by their handle", async ({
    page,
  }) => {
    const { slug } = await profileOf();
    await db()
      .from("users")
      .update({ x_handle: "Zephyr_Dev" })
      .eq("id", await devUserId());
    // The handle, however it's written, and the old slug all land on it.
    for (const written of ["@Zephyr_Dev", "@zephyr_dev", "Zephyr_Dev", slug]) {
      await page.goto(`/u/${written}`);
      await expect(page).toHaveURL(/\/u\/@Zephyr_Dev$/);
    }
    await expect(page.getByTestId("creator-profile")).toContainText(
      "@Zephyr_Dev",
    );
    await page.goto("/");
    await expect(
      page
        .getByTestId("bot-row")
        .filter({ hasText: FIXTURES.alpha.name })
        .getByTestId("creator-link"),
    ).toHaveAttribute("href", "/u/@Zephyr_Dev");
  });

  test("404s for a handle nobody has and a member with nothing listed", async ({
    request,
  }) => {
    expect((await request.get("/u/e2e-nobody-here")).status()).toBe(404);
    expect((await request.get("/u/@e2e_nobody")).status()).toBe(404);
    // A member whose only submission is still in review.
    const member = await memberWithNothingListed();
    expect((await request.get(`/u/${member.slug}`)).status()).toBe(404);
  });

  test("the first address, /creators/, still works", async ({ page }) => {
    const { slug } = await profileOf();
    await page.goto(`/creators/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/u/${slug}$`));
    await expect(page.getByTestId("creator-profile")).toBeVisible();
  });

  test("a profile that isn't public has no page", async ({ request }) => {
    const { slug } = await profileOf();
    await db()
      .from("users")
      .update({ public: false })
      .eq("id", await devUserId());
    expect((await request.get(`/u/${slug}`)).status()).toBe(404);
  });

  test("is in the sitemap and unfurls with a preview", async ({
    page,
    request,
  }) => {
    const { slug } = await profileOf();
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain(`/u/${slug}</loc>`);

    await page.goto(`/u/${slug}`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /Local Dev/,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    const image = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(image).toContain(`/u/${slug}/opengraph-image`);
    const res = await request.get(new URL(image as string).pathname);
    expect(res.ok()).toBe(true);
    expect(res.headers()["content-type"]).toBe("image/png");
  });

  test("the account menu has the member's own profile", async ({ page }) => {
    const { slug } = await profileOf();
    await signIn(page, "/");
    await page.getByRole("button", { name: "Account menu" }).click();
    const item = page.getByTestId("menu-profile");
    await expect(item).toHaveAttribute("href", `/u/${slug}`);
    await item.click();
    await expect(page).toHaveURL(new RegExp(`/u/${slug}$`));
    await expect(page.getByTestId("creator-profile")).toBeVisible();
  });

  test("Your submissions links to the public profile", async ({ page }) => {
    const { slug } = await profileOf();
    await signIn(page, "/my-bots");
    const link = page
      .getByTestId("public-profile")
      .getByRole("link", { name: "View public profile" });
    await expect(link).toHaveAttribute("href", `/u/${slug}`);
    await expect(
      page.getByTestId("public-profile").getByTestId("copy-link"),
    ).toBeVisible();
    await link.click();
    await expect(page.getByTestId("creator-profile")).toBeVisible();
  });
});
