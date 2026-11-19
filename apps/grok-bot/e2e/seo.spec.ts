import { expect, test } from "@playwright/test";
import { FIXTURES } from "./fixtures";

/** Width and height from a PNG's IHDR chunk. */
function pngSize(body: Buffer) {
  expect(body.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

test.describe("seo", () => {
  test("robots.txt keeps private pages out and points at the sitemap", async ({
    request,
  }) => {
    const res = await request.get("/robots.txt");
    expect(res.ok()).toBe(true);
    const text = await res.text();
    for (const path of ["/admin", "/my-bots", "/submit", "/api/"])
      expect(text).toContain(`Disallow: ${path}`);
    expect(text).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });

  test("sitemap lists listed bots only", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.ok()).toBe(true);
    const xml = await res.text();
    expect(xml).toContain(`/bots/${FIXTURES.alpha.slug}</loc>`);
    expect(xml).toContain(`/bots/${FIXTURES.beta.slug}</loc>`);
    expect(xml).not.toContain(FIXTURES.pending.slug);
    expect(xml).not.toContain(FIXTURES.declined.slug);
  });

  for (const path of [
    "/opengraph-image",
    `/bots/${FIXTURES.alpha.slug}/opengraph-image`,
  ])
    test(`Open Graph image ${path}`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.ok()).toBe(true);
      expect(res.headers()["content-type"]).toBe("image/png");
      expect(pngSize(await res.body())).toEqual({ width: 1200, height: 630 });
    });

  test("home page carries share metadata", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /\/opengraph-image/,
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      /Grok Bot/,
    );
  });

  test("the About page answers the common questions", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "About" })
      .click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "About the directory",
    );
    for (const id of ["marketplace", "listing", "ranking", "adding"])
      await expect(page.locator(`section#${id} h2`)).toBeVisible();
    await expect(
      page
        .locator("section#marketplace")
        .getByRole("link", { name: "Marketplace" }),
    ).toHaveAttribute("href", "https://x.ai/bot/marketplace");
  });
});
