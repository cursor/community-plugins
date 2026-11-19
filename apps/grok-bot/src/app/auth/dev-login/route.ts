import { NextResponse } from "next/server";
import { claimMarketplaceBots } from "@/lib/claim-bots";
import { devLoginEnabled } from "@/lib/dev-login";
import { rememberSignIn } from "@/lib/last-sign-in";
import { safeNextPath } from "@/lib/safe-next";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";
import { createClient } from "@/utils/supabase/server";

// Local development only (see AGENTS.md: GitHub/Google OAuth aren't configured
// against the local Supabase stack). Signs in as a confirmed password user,
// creating it on first use; the signup trigger provisions public.users.
const DEV_EMAIL = "dev@grok-bot.local";
const DEV_PASSWORD = "local-dev-only-password";

export async function POST(request: Request) {
  if (!devLoginEnabled()) return new NextResponse("Not found", { status: 404 });
  const form = await request.formData();
  const next = safeNextPath(
    String(form.get("next") ?? "/"),
    new URL(request.url).origin,
  );

  const supabase = await createClient();
  let { error } = await supabase.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  });
  if (error) {
    const admin = await createAdminClient();
    await admin.auth.admin.createUser({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Local Dev" },
    });
    ({ error } = await supabase.auth.signInWithPassword({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    }));
  }
  if (error)
    return NextResponse.redirect(
      new URL(`/login?error=1&next=${encodeURIComponent(next)}`, request.url),
      { status: 303 },
    );
  // What an X sign-in does once it knows the member's handle, so that can be
  // tried locally: give the local user an x_handle and sign in.
  const { data: signedIn } = await supabase.auth.getUser();
  if (signedIn.user) {
    const admin = await createAdminClient();
    const { data: member } = await admin
      .from("users")
      .select("x_handle")
      .eq("id", signedIn.user.id)
      .maybeSingle();
    if (member?.x_handle)
      await claimMarketplaceBots(signedIn.user.id, member.x_handle);
  }
  return rememberSignIn(
    NextResponse.redirect(new URL(next, request.url), { status: 303 }),
    "dev",
  );
}
