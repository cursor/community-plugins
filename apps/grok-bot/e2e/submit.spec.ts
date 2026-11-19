import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

test.describe("submit", () => {
  test("explains a link that isn't a Grok Bot share link", async ({ page }) => {
    await signIn(page, "/submit");
    const input = page.getByLabel("Share link", { exact: true });
    const fieldBottom = () =>
      page
        .locator(".field")
        .evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
    const before = await fieldBottom();
    await input.fill("https://example.com/not-a-bot");
    await input.blur();
    await expect(page.locator("#share-help")).toHaveText(
      /Paste a Grok Bot share link/,
    );
    // The error takes the hint's place without moving the page.
    expect(await fieldBottom()).toBe(before);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("submit-preview")).toHaveCount(0);
  });

  test("the bot form links to the listing rules", async ({ page }) => {
    await signIn(page, "/submit");
    await page
      .getByTestId("submit-rules")
      .getByRole("link", { name: "listing rules" })
      .click();
    await expect(page).toHaveURL(/\/about#rules$/);
    const rules = page.getByTestId("listing-rules");
    await expect(rules.getByRole("heading", { level: 2 })).toHaveText(
      "Listing rules",
    );
    await expect(rules.getByRole("listitem")).toHaveCount(5);
    // They hold for apps as well as bots.
    await expect(rules).toContainText("We don’t list bots or apps that:");
    await expect(rules).toContainText("adult content");
    await expect(rules).toContainText("at our discretion");
  });

  test("copies the share prompt", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signIn(page, "/submit");
    const prompt = page.getByTestId("copy-prompt");
    await prompt.click();
    await expect(prompt).toHaveAttribute("data-copied", "true");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "Share yourself as a public template",
    );
  });

  // Reads a real public bot from x.ai, so it only runs with E2E_NETWORK=1.
  // It previews the bot and stops before submitting.
  test("previews a shared bot with an engine bot", async ({ page }) => {
    test.skip(!process.env.E2E_NETWORK, "needs network (E2E_NETWORK=1)");
    await signIn(page, "/submit");
    await page
      .getByLabel("Share link", { exact: true })
      .fill("https://x.ai/bot/AZKaQOsjrAa51Nb4xvTur");
    const preview = page.getByTestId("submit-preview");
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(preview.getByTestId("preview-bot")).toBeVisible();
    await expect(preview.locator("h2")).not.toBeEmpty();
    // The share link opens the bot on x.ai in a new tab.
    const shareLink = preview.getByTestId("preview-share-link");
    await expect(shareLink).toHaveAttribute(
      "href",
      "https://x.ai/bot/AZKaQOsjrAa51Nb4xvTur",
    );
    await expect(shareLink).toHaveAttribute("target", "_blank");
    // The example bot is on the marketplace, so x.ai names its author.
    await expect(preview.getByTestId("preview-author")).toContainText(/^By /);
    // With an X handle, the name itself links to their X profile.
    await expect(preview.getByTestId("preview-author-link")).toHaveAttribute(
      "href",
      /^https:\/\/x\.com\/\w+$/,
    );
    await expect(preview.getByTestId("preview-author")).not.toContainText("@");
  });
});
