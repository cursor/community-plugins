import { refreshAllGrokBotAddable } from "@directories/plugins/grok-bot-add";
import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { createClient } from "@/utils/supabase/admin-client";

// Weekly: recomputes plugins.grok_bot_addable for every plugin, in case a
// write somewhere missed it (packages/plugins/src/grok-bot-add.ts). The Grok
// Bot Directory lists only plugins where it is true.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const summary = await refreshAllGrokBotAddable(await createClient());
    console.log(
      `[refresh-grok-bot-addable] ${summary.becameAddable} became addable, ${summary.stoppedBeingAddable} stopped being addable`,
    );
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("refresh-grok-bot-addable failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
