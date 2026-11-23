import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { createClient } from "@/utils/supabase/server";

/**
 * Signs the member out and sends them home, or to the in-site path the form
 * names in `next` (the sign-in page, when they're switching accounts).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { origin } = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const next = safeNextPath(form?.get("next")?.toString(), origin);
  return NextResponse.redirect(new URL(next, origin), { status: 303 });
}
