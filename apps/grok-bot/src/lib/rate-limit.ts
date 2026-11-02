import "server-only";

import { checkRateLimit } from "@vercel/firewall";
import { headers } from "next/headers";

/**
 * Rate limits live in the Vercel Firewall dashboard; each id below needs a
 * matching rule (see .env.example). Code only owns the key shape. Outside
 * production checkRateLimit is a no-op unless
 * NEXT_PUBLIC_VERCEL_FIREWALL_HOST_FOR_DEVELOPMENT is set. Mirrors
 * apps/cursor/src/lib/rate-limit.ts.
 */
const RATE_LIMIT_IDS = {
  installPerBot: "grok-bot-install-per-bot",
  installGlobal: "grok-bot-install-global",
  submit: "grok-bot-submit",
} as const;

const firewallHostForDevelopment =
  process.env.NEXT_PUBLIC_VERCEL_FIREWALL_HOST_FOR_DEVELOPMENT;

async function check(
  rateLimitId: string,
  rateLimitKey?: string,
): Promise<{ success: boolean }> {
  const { rateLimited, error } = await checkRateLimit(rateLimitId, {
    headers: new Headers(await headers()),
    rateLimitKey,
    firewallHostForDevelopment,
  });
  // Fail open on a missing dashboard rule (better than locking everyone
  // out), but loudly so it's caught.
  if (error === "not-found") {
    console.error(
      `[rate-limit] Vercel Firewall rule '${rateLimitId}' is not configured; rate limiting is disabled for it.`,
    );
  }
  return { success: !rateLimited };
}

async function ip(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

export async function installPerBotLimit(botId: string) {
  return check(RATE_LIMIT_IDS.installPerBot, `${await ip()}:${botId}`);
}

export async function installGlobalLimit() {
  return check(RATE_LIMIT_IDS.installGlobal);
}

export async function submitLimit(userId: string) {
  return check(RATE_LIMIT_IDS.submit, userId);
}
