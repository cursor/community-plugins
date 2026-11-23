import { expect, test } from "@playwright/test";
import { SEEN_KEY, UPDATES, updatesSince } from "../src/lib/whats-new";
import { signIn } from "./fixtures";

test.describe("what's new", () => {
  test("a member is shown what's newer than they last saw, two at most", () => {
    const ids = (seen: string | null) => updatesSince(seen).map((u) => u.id);
    const all = UPDATES.map((u) => u.id);
    // Someone who has never looked isn't shown the whole history.
    expect(ids(null)).toEqual(all.slice(0, 2));
    expect(ids(all[0])).toEqual([]);
    expect(ids(all[1])).toEqual([all[0]]);
    // An update that has since been taken down counts as never having looked.
    expect(ids("gone")).toEqual(all.slice(0, 2));
  });

  test("visitors who aren't signed in aren't shown the card", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("bot-row").first()).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("whats-new")).toHaveCount(0);
  });

  test("a signed-in member sees it once, and can find it again in the menu", async ({
    page,
  }) => {
    await signIn(page, "/", { whatsNew: true });
    const card = page.getByTestId("whats-new");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(
      UPDATES.slice(0, 2).map((u) => u.title),
    );
    // It doesn't take over the page.
    await expect(page.getByTestId("bot-row").first()).toBeVisible();
    await card.getByRole("button", { name: "Got it" }).click();
    await expect(card).toHaveCount(0);
    // That was it, until there's something newer.
    await page.reload();
    await expect(page.getByTestId("bot-row").first()).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(card).toHaveCount(0);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "What’s new" }).click();
    await expect(page).toHaveURL("/whats-new");
    await expect(
      page.getByTestId("whats-new-page").getByRole("heading", { level: 3 }),
    ).toHaveText(UPDATES.map((u) => u.title));
  });

  test("only what's new since last time is shown", async ({ page }) => {
    await page.addInitScript(
      ([key, id]) => window.localStorage.setItem(key, id),
      [SEEN_KEY, UPDATES[1].id],
    );
    await signIn(page, "/my-bots", { whatsNew: true });
    const card = page.getByTestId("whats-new");
    await expect(card.getByRole("heading", { level: 3 })).toHaveText([
      UPDATES[0].title,
    ]);
    // Following an update's link is having seen it.
    await card.getByRole("link", { name: /Find your app/ }).click();
    await expect(page).toHaveURL("/?tab=apps");
    await expect(card).toHaveCount(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), SEEN_KEY),
    ).toBe(UPDATES[0].id);
  });

  test("the page that lists everything doesn't also show the card", async ({
    page,
  }) => {
    await signIn(page, "/whats-new", { whatsNew: true });
    await expect(page.getByTestId("whats-new-page")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("whats-new")).toHaveCount(0);
  });
});
