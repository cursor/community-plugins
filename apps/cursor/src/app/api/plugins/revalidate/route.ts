import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({ slug: z.string().min(1).max(200) });

/**
 * Refreshes cached plugin pages after a plugin changed outside this
 * deployment: the Grok Bot Directory moderates the same plugins (as "Apps")
 * and calls this after each decision. Requires
 * `Authorization: Bearer ${PLUGIN_REVALIDATE_SECRET}`; fails closed when the
 * secret isn't set.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PLUGIN_REVALIDATE_SECRET;
  if (!secret) {
    console.error(
      "[plugins/revalidate] PLUGIN_REVALIDATE_SECRET is not set; refusing.",
    );
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { slug }" }, { status: 400 });
  }

  revalidatePath("/admin/plugins");
  revalidateTag("plugins", { expire: 0 });
  revalidateTag(`plugin-${parsed.data.slug}`, { expire: 0 });
  return NextResponse.json({ ok: true });
}
