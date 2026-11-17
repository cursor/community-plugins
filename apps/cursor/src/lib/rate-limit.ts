import "server-only";

import { checkRateLimit } from "@vercel/firewall";
import { headers } from "next/headers";

/**
 * Rate limits live in the Vercel Firewall dashboard. Each `rateLimitId` below
 * must have a matching `@vercel/firewall` rule configured with the window and
 * threshold listed in the comment. Code only owns the *key shape* — the limit
 * itself is changed in the dashboard.
 *
 * Required dashboard rules:
 *   install-per-plugin   3 requests / 24h   (key: `${ip}:${pluginId}`)
 *   install-global       20 requests / 1h   (key: ip, default)
 *   plugin-scan          5 requests / 1h    (key: userId)
 *   mcp-moderation       60 requests / 1h   (key: userId)
 *
 * In non-production, `checkRateLimit` is a no-op unless
 * `NEXT_PUBLIC_VERCEL_FIREWALL_HOST_FOR_DEVELOPMENT` is set to a deployed host
 * (e.g. your preview URL).
 */
const RATE_LIMIT_IDS = {
  installPerPlugin: "install-per-plugin",
  installGlobal: "install-global",
  pluginScan: "plugin-scan",
  mcpModeration: "mcp-moderation",
} as const;

const firewallHostForDevelopment =
  process.env.NEXT_PUBLIC_VERCEL_FIREWALL_HOST_FOR_DEVELOPMENT;

type LimitResult = { success: boolean };

async function getRequestHeaders(): Promise<Headers> {
  return new Headers(await headers());
}

function getIpFromHeaders(h: Headers): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

async function check({
  rateLimitId,
  rateLimitKey,
}: {
  rateLimitId: string;
  rateLimitKey?: string;
}): Promise<LimitResult> {
  const requestHeaders = await getRequestHeaders();
  const { rateLimited, error } = await checkRateLimit(rateLimitId, {
    headers: requestHeaders,
    rateLimitKey,
    firewallHostForDevelopment,
  });

  // We deliberately fail open on misconfiguration: a missing dashboard rule
  // shouldn't lock out every user (worse than no rate limit). But silent
  // fail-open is dangerous, so surface it loudly so it's caught in
  // production logs / alerting instead of going unnoticed.
  if (error === "not-found") {
    console.error(
      `[rate-limit] Vercel Firewall rule '${rateLimitId}' is not configured. Rate limiting is DISABLED for this rule until the rule is created in the Firewall dashboard.`,
    );
  }

  return { success: !rateLimited };
}

export async function installPerPluginLimit(
  pluginId: string,
): Promise<LimitResult> {
  const ip = getIpFromHeaders(await getRequestHeaders());
  return check({
    rateLimitId: RATE_LIMIT_IDS.installPerPlugin,
    rateLimitKey: `${ip}:${pluginId}`,
  });
}

export async function installGlobalLimit(): Promise<LimitResult> {
  return check({ rateLimitId: RATE_LIMIT_IDS.installGlobal });
}

export async function pluginScanLimit(userId: string): Promise<LimitResult> {
  return check({
    rateLimitId: RATE_LIMIT_IDS.pluginScan,
    rateLimitKey: userId,
  });
}

// Write tools on the MCP server; caps runaway agent loops (re-scans are
// billable SpaceXSI API calls).
export async function mcpModerationLimit(userId: string): Promise<LimitResult> {
  return check({
    rateLimitId: RATE_LIMIT_IDS.mcpModeration,
    rateLimitKey: userId,
  });
}
