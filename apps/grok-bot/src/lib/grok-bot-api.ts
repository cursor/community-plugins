import "server-only";

import { z } from "zod";
import { DESCRIPTION_MAX, fit, NAME_MAX } from "@/lib/card-limits";

// Public, unauthenticated Grok Bot RPCs (Connect protocol, JSON). These are
// the reads x.ai's own share and marketplace pages use: they return only the
// public card (no owner ids, emails or bot instructions).
const API_URL = process.env.GROK_BOT_API_URL ?? "https://api2.cursor.sh";
const SERVICE = "aiserver.v1.GrokBotService";
const TIMEOUT_MS = 8_000;

class GrokBotApiError extends Error {}

async function call(method: string, body: unknown): Promise<unknown | null> {
  const res = await fetch(`${API_URL}/${SERVICE}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  // Not found, or not a share id the API accepts (malformed ids get
  // invalid_argument): either way there's no shared bot there.
  if (res.status === 404) return null;
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as {
      code?: string;
    } | null;
    if (body?.code === "invalid_argument") return null;
  }
  if (!res.ok) throw new GrokBotApiError(`${method} answered ${res.status}`);
  return res.json();
}

// Proto3 JSON omits default values, so most fields are optional here.
const TemplateWire = z.object({
  template: z.object({
    shareId: z.string(),
    name: z.string().default(""),
    description: z.string().default(""),
    avatarShape: z.string().default(""),
    avatarColor: z.string().default(""),
    published: z.boolean().default(false),
    ownerType: z.string().optional(),
    updatedAtMs: z.string().optional(),
  }),
  ownerDisplayName: z.string().default(""),
});

export type ShareTemplate = {
  shareId: string;
  name: string;
  description: string;
  shape: string;
  color: string;
  updatedAt: string | null;
  ownerDisplayName: string;
};

export type TemplateLookup =
  | { status: "ok"; template: ShareTemplate }
  | { status: "not_found" }
  // Team bots: x.ai blanks their public card, so they can't be listed.
  | { status: "team" }
  | { status: "unavailable" };

export async function getPublicTemplate(
  shareId: string,
): Promise<TemplateLookup> {
  let raw: unknown;
  try {
    raw = await call("GetPublicGrokBotTemplate", { shareId });
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "not_found" };
  const parsed = TemplateWire.safeParse(raw);
  if (!parsed.success) return { status: "unavailable" };
  const { template, ownerDisplayName } = parsed.data;
  if (template.ownerType?.endsWith("TEAM") || !template.name)
    return { status: "team" };
  if (!template.published) return { status: "not_found" };
  return {
    status: "ok",
    template: {
      shareId: template.shareId,
      // Cut to what a listing stores, so a long card can still be submitted.
      name: fit(template.name.trim(), NAME_MAX),
      description: fit(template.description.trim(), DESCRIPTION_MAX),
      shape: template.avatarShape,
      color: template.avatarColor,
      updatedAt: template.updatedAtMs
        ? new Date(Number(template.updatedAtMs)).toISOString()
        : null,
      ownerDisplayName,
    },
  };
}

const ListingWire = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().default(""),
  shareId: z.string().default(""),
  defaultAvatar: z.object({ shape: z.string(), color: z.string() }).optional(),
  categories: z.array(z.string()).default([]),
  updatedAtMs: z.string().optional(),
  creator: z
    .object({
      name: z.string().default(""),
      profilePhotoUrl: z.string().optional(),
      handles: z.object({ x: z.string().optional() }).optional(),
    })
    .optional(),
});
export type MarketplaceListing = z.infer<typeof ListingWire>;

const ListingsPage = z.object({
  featuredListings: z.array(ListingWire).default([]),
  listings: z.array(ListingWire).default([]),
  nextPageToken: z.string().default(""),
});

export type BotAuthor = {
  name: string;
  image: string | null;
  xHandle: string | null;
};

// The marketplace is one small list, so author lookups share a short-lived
// copy instead of fetching it for every pasted link.
const MARKETPLACE_TTL_MS = 10 * 60_000;
let marketplace: {
  at: number;
  byShareId: Promise<Map<string, MarketplaceListing>>;
} | null = null;

function marketplaceByShareId() {
  if (!marketplace || Date.now() - marketplace.at > MARKETPLACE_TTL_MS) {
    const byShareId = listMarketplace().then(
      (all) => new Map(all.map((l) => [l.shareId, l])),
    );
    byShareId.catch(() => {
      marketplace = null;
    });
    marketplace = { at: Date.now(), byShareId };
  }
  return marketplace.byShareId;
}

/**
 * The bot's author as x.ai shows it publicly: the marketplace creator (name,
 * photo, X handle) or the share card's byline. Null when x.ai names no one,
 * which is most shared bots today.
 */
export async function findAuthor(
  template: ShareTemplate,
): Promise<BotAuthor | null> {
  const listing = await marketplaceByShareId()
    .then((m) => m.get(template.shareId))
    .catch(() => undefined);
  const creator = listing?.creator;
  if (creator?.name)
    return {
      name: creator.name.trim(),
      image: creator.profilePhotoUrl || null,
      xHandle: creator.handles?.x || null,
    };
  const byline = template.ownerDisplayName.trim();
  return byline ? { name: byline, image: null, xHandle: null } : null;
}

/** Every listing on the official x.ai/bot marketplace. */
export async function listMarketplace(): Promise<MarketplaceListing[]> {
  const bySlug = new Map<string, MarketplaceListing>();
  let pageToken = "";
  do {
    const raw = await call("ListPublicGrokBotMarketplaceListings", {
      pageSize: 100,
      pageToken,
    });
    const page = ListingsPage.parse(raw ?? {});
    for (const listing of [...page.featuredListings, ...page.listings])
      bySlug.set(listing.slug, listing);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return [...bySlug.values()];
}
