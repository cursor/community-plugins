import { NextResponse } from "next/server";
import { parseSignInMethod, rememberSignIn } from "@/lib/last-sign-in";
import { safeNextPath } from "@/lib/safe-next";
import { fillXLink } from "@/lib/x-profile";
import { createClient } from "@/utils/supabase/server";

// Mirrors apps/cursor/src/app/auth/callback/route.ts.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), origin);
  // Which button started this sign-in (set by SignInButtons).
  const via = parseSignInMethod(searchParams.get("via"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Best effort; a failure here shouldn't block signing in.
      if (via === "x") await fillXLink(data.user).catch(() => {});
      const forwardedHost = request.headers.get("x-forwarded-host");
      const response =
        process.env.NODE_ENV !== "development" && forwardedHost
          ? NextResponse.redirect(`https://${forwardedHost}${next}`)
          : NextResponse.redirect(`${origin}${next}`);
      return via ? rememberSignIn(response, via) : response;
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=1&next=${encodeURIComponent(next)}`,
  );
}
