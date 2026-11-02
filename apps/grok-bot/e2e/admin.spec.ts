import { expect, type Page, test } from "@playwright/test";
import {
  expectBotReactsToHover,
  FIXTURES,
  seedFixtures,
  setDevAdmin,
  signIn,
} from "./fixtures";

// These tests change the fixture bots, so each starts from a fresh seed.
test.describe("admin", () => {
  test.beforeEach(async () => {
    await seedFixtures();
    await setDevAdmin(true);
  });

  const card = (page: Page, testId: string, name: string) =>
    page.getByTestId(testId).filter({ hasText: name });

  test("is hidden from members who aren't admins", async ({ page }) => {
    await setDevAdmin(false);
    await signIn(page, "/my-bots");
    await page.goto("/admin");
    await expect(
      page.getByText("This page doesn’t exist, or the bot isn’t listed."),
    ).toBeVisible();
  });

  test("review queue: decline needs a note, then lists or declines", async ({
    page,
  }) => {
    await signIn(page, "/admin");
    const pending = card(page, "review", FIXTURES.pending.name);
    await expect(pending.getByTestId("ai-review")).toHaveAttribute(
      "data-verdict",
      "suspicious",
    );
    await expect(pending).toContainText("Reads like link bait.");
    // Credits the author x.ai names and says who submitted it.
    await expect(pending.locator(".sub-meta")).toContainText(
      `By ${FIXTURES.pending.author} · submitted by Local Dev`,
    );
    await expectBotReactsToHover(pending, pending.getByTestId("card-bot"));

    await pending.getByRole("button", { name: "Decline" }).click();
    await expect(pending).toContainText("Add a note so the submitter knows");

    await pending.getByLabel("Reviewer note").fill("Remove the sign-up link.");
    await pending.getByRole("button", { name: "Decline" }).click();
    await expect(pending).toHaveCount(0);

    await page.getByRole("tab", { name: /Removed/ }).click();
    const removed = card(page, "removed-card", FIXTURES.pending.name);
    await expect(removed).toContainText("Declined");
    await expect(removed).toContainText("Remove the sign-up link.");
    await removed.getByText(/^History/).click();
    await expect(removed.getByTestId("history")).toContainText("Declined");
  });

  test("review queue: listing publishes the bot", async ({ page }) => {
    await signIn(page, "/admin");
    const pending = card(page, "review", FIXTURES.pending.name);
    await pending.getByLabel("Category").selectOption("marketing");
    await pending.getByRole("button", { name: "List" }).click();
    await expect(pending).toHaveCount(0);

    await page.goto(`/bots/${FIXTURES.pending.slug}`);
    await expect(
      page.getByRole("heading", { level: 1, name: FIXTURES.pending.name }),
    ).toBeVisible();
    await expect(
      page.getByText(`By ${FIXTURES.pending.author}`).first(),
    ).toBeVisible();
    await expect(page.getByText("Marketing").first()).toBeVisible();
  });

  test("listed: change the category, unlist with a note, relist", async ({
    page,
  }) => {
    await signIn(page, "/admin?tab=listed");
    const listed = card(page, "listed-card", FIXTURES.alpha.name);

    await listed.getByLabel("Category").selectOption("engineering");
    await listed.getByRole("button", { name: "Save category" }).click();
    await expect(listed.getByRole("button", { name: "Saved" })).toBeVisible();
    await listed.getByText(/^History/).click();
    await expect(listed.getByTestId("history")).toContainText(
      "Changed the category",
    );

    await listed.getByRole("button", { name: "Unlist" }).click();
    await expect(listed).toContainText("Add a note so the submitter knows");
    await listed.getByLabel("Unlist note").fill("Duplicate of another bot.");
    await listed.getByRole("button", { name: "Unlist" }).click();
    await expect(listed).toHaveCount(0);

    // Gone from the public site...
    await page.goto(`/bots/${FIXTURES.alpha.slug}`);
    await expect(
      page.getByText("This page doesn’t exist, or the bot isn’t listed."),
    ).toBeVisible();

    // ...and on the Removed tab with its note, ready to relist.
    await page.goto("/admin?tab=removed");
    const removed = card(page, "removed-card", FIXTURES.alpha.name);
    await expect(removed).toContainText("Unlisted");
    await expect(removed).toContainText("Duplicate of another bot.");
    await removed.getByRole("button", { name: "Relist" }).click();
    await expect(removed).toHaveCount(0);

    await page.goto("/admin?tab=listed");
    const back = card(page, "listed-card", FIXTURES.alpha.name);
    await back.getByText(/^History/).click();
    const history = back.getByTestId("history");
    for (const action of ["Listed", "Unlisted", "Changed the category"])
      await expect(history).toContainText(action);
    await expect(history).toContainText("Duplicate of another bot.");
  });
});
