import type { NextResponse } from "next/server";

/** Sign-in methods, in the order the sign-in page shows them. */
export const SIGN_IN_METHODS = ["x", "github", "google", "dev"] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

// Remembers the method of the last *completed* sign-in on this browser, so
// the sign-in page can mark it "Last used". Set by /auth/callback and
// /auth/dev-login after the session is created.
const COOKIE = "gb_last_sign_in";

export function parseSignInMethod(
  value: string | null | undefined,
): SignInMethod | null {
  return SIGN_IN_METHODS.find((m) => m === value) ?? null;
}

export function readLastSignIn(cookies: {
  get(name: string): { value: string } | undefined;
}): SignInMethod | null {
  return parseSignInMethod(cookies.get(COOKIE)?.value);
}

export function rememberSignIn(response: NextResponse, method: SignInMethod) {
  response.cookies.set(COOKIE, method, {
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
