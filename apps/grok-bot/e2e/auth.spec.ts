import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

test.describe("sign-in", () => {
  for (const path of ["/my-bots", "/submit", "/admin"])
    test(`${path} asks signed-out visitors to sign in first`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
      await expect(
        page.getByRole("button", { name: "Sign in with GitHub" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Sign in with Google" }),
      ).toBeVisible();
    });

  test("signing in returns to the page that asked", async ({ page }) => {
    await signIn(page, "/my-bots");
    await expect(page).toHaveURL("/my-bots");
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });

  test("marks the method of the last completed sign-in", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await expect(page.locator(".last-used")).toHaveCount(0);
    await signIn(page, "/my-bots");
    // Sign out but keep the browser's other cookies.
    await context.clearCookies({ name: /^sb-/ });
    await page.goto("/login");
    await expect(page.locator("button:has(.last-used)")).toHaveText(
      /Local dev sign-in\s*Last used/,
    );
  });

  test("the sign-in page refuses off-site redirects", async ({ page }) => {
    await page.goto("/login?next=https://evil.example");
    await page.getByRole("button", { name: "Local dev sign-in" }).click();
    await expect(page).toHaveURL("/");
  });
});
