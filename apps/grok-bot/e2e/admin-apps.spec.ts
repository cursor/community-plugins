import { expect, type Page, test } from "@playwright/test";
import {
  APP_FIXTURES,
  db,
  seedFixtures,
  setDevAdmin,
  signIn,
} from "./fixtures";

// Apps are cursor.directory plugins; moderating them here writes the same
// rows and audit log cursor.directory's admin does. Each test starts from a
// fresh seed.
test.describe("admin: apps", () => {
  test.beforeEach(async () => {
    await seedFixtures();
    await setDevAdmin(true);
  });

  const card = (page: Page, name: string) =>
    page.getByTestId("app-review").filter({ hasText: name });

  const eventsFor = async (slug: string) => {
    const { data: plugin } = await db()
      .from("plugins")
      .select("id")
      .eq("slug", slug)
      .single();
    const { data } = await db()
      .from("plugin_moderation_events")
      .select("action, source, reason")
      .eq("plugin_id", plugin?.id ?? "")
      .order("created_at");
    return data ?? [];
  };

  test("is hidden from members who aren't admins", async ({ page }) => {
    await setDevAdmin(false);
    await signIn(page, "/my-bots");
    await page.goto("/admin?kind=apps");
    await expect(
      page.getByText("This page doesn’t exist, or the bot isn’t listed."),
    ).toBeVisible();
  });

  test("queue: shows the scan verdict, blocking needs a note, approving lists it", async ({
    page,
  }) => {
    await signIn(page, "/admin?kind=apps");
    const flagged = card(page, APP_FIXTURES.flagged.name);
    await expect(flagged.getByTestId("scan-review")).toHaveAttribute(
      "data-verdict",
      "suspicious",
    );
    await expect(flagged).toContainText(APP_FIXTURES.flagged.summary);
    await expect(flagged).toContainText("submitted by Local Dev");

    // The note box only opens for Block, and Block won't go through empty.
    await expect(flagged.getByLabel("Block note")).toHaveCount(0);
    await flagged.getByRole("button", { name: "Block" }).click();
    await expect(flagged.getByLabel("Block note")).toBeFocused();
    await flagged.getByRole("button", { name: "Block" }).click();
    await expect(flagged).toContainText("Add a note saying why it’s blocked.");
    await flagged.getByRole("button", { name: "Cancel" }).click();
    await expect(flagged.getByLabel("Block note")).toHaveCount(0);

    await flagged.getByRole("button", { name: "Approve" }).click();
    await expect(flagged).toHaveCount(0);
    await page.getByRole("tab", { name: /^Listed/ }).click();
    await expect(card(page, APP_FIXTURES.flagged.name)).toBeVisible();
    // Approved on this site, recorded where cursor.directory records it.
    expect(await eventsFor(APP_FIXTURES.flagged.slug)).toEqual([
      { action: "approve_flagged", source: "web", reason: null },
    ]);
    // And it's live in the Apps tab.
    const res = await page.goto(`/apps/${APP_FIXTURES.flagged.slug}`);
    expect(res?.status()).toBe(200);
  });

  test("listed: unpublish, then relist", async ({ page }) => {
    await signIn(page, "/admin?kind=apps&tab=listed");
    const listed = card(page, APP_FIXTURES.community.name);
    await listed.getByRole("button", { name: "Unpublish" }).click();
    await expect(listed).toHaveCount(0);

    await page.getByRole("tab", { name: /^Removed/ }).click();
    const removed = card(page, APP_FIXTURES.community.name);
    await removed.getByRole("button", { name: "Relist" }).click();
    await expect(removed).toHaveCount(0);

    expect(
      (await eventsFor(APP_FIXTURES.community.slug)).map((e) => e.action),
    ).toEqual(["unpublish", "approve"]);
  });
});
