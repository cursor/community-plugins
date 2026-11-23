import { expect, test } from "@playwright/test";
import { listed, otherProviders } from "../src/lib/sign-in-providers";
import { seedFixtures, signIn } from "./fixtures";

test.describe("a listing that seems to be missing", () => {
  test.beforeAll(seedFixtures);

  test("the other ways to sign in are the ones this account hasn't used", () => {
    expect(otherProviders(["x"], { xSignIn: true })).toEqual([
      "github",
      "google",
    ]);
    expect(otherProviders(["github", "google"], { xSignIn: true })).toEqual([
      "x",
    ]);
    // X isn't suggested where the sign-in page doesn't offer it.
    expect(otherProviders(["github"], { xSignIn: false })).toEqual(["google"]);
    expect(
      otherProviders(["x", "github", "google"], { xSignIn: true }),
    ).toEqual([]);
    expect(listed(["x"], "and")).toBe("X");
    expect(listed(["x", "google"], "and")).toBe("X and Google");
    expect(listed(["x", "github", "google"], "or")).toBe("X, GitHub or Google");
  });

  test("Your submissions says where else a listing could be", async ({
    page,
  }) => {
    await signIn(page, "/my-bots");
    const hint = page.getByTestId("missing-listing");
    // The local dev account signs in with none of them.
    await expect(hint.getByTestId("other-sign-in")).toContainText(
      "If you submitted with X, GitHub or Google, switch to that sign-in.",
    );
    // An app added for its maker is claimed from its page.
    await expect(hint.getByRole("link", { name: "Apps" })).toHaveAttribute(
      "href",
      "/?tab=apps",
    );
    // Switching signs out and goes straight to the sign-in page, which
    // comes back here.
    await hint.getByRole("button", { name: "Switch sign-in" }).click();
    await expect(page).toHaveURL("/login?next=/my-bots");
    await expect(page.getByTestId("auth")).toBeVisible();
  });

  test("signing out goes home, and never off the site", async ({ page }) => {
    await signIn(page, "/my-bots");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Sign in" }),
    ).toBeVisible();

    const res = await page.request.post("/auth/sign-out", {
      form: { next: "https://evil.example/login" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(new URL(res.headers().location).pathname).toBe("/");
    expect(new URL(res.headers().location).host).toBe(new URL(page.url()).host);
  });
});
