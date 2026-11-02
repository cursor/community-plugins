import { expect, test } from "@playwright/test";
import {
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
