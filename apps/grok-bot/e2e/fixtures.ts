import { expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

loadEnv();

// The account /auth/dev-login signs in as (src/app/auth/dev-login/route.ts).
export const DEV_EMAIL = "dev@grok-bot.local";
const DEV_PASSWORD = "local-dev-only-password";

// Fixture bots are the only rows these tests create or change. Their slugs
// start with "e2e-" and their share ids with "e2eFixture"; seeding deletes
// and re-inserts them, so every run starts from the same state.
const SLUG_PREFIX = "e2e-";

export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in apps/grok-bot/.env",
    );
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url))
    throw new Error(`Refusing to seed a non-local Supabase project (${url})`);
  return createClient(url, key, { auth: { persistSession: false } });
}

/** The dev user's id, creating the confirmed password user if needed. */
export async function devUserId(): Promise<string> {
  const admin = db();
  const find = async () => {
    const { data, error } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (error) throw error;
    return data.users.find((u) => u.email === DEV_EMAIL)?.id;
  };
  const existing = await find();
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Local Dev" },
  });
  if (error) throw error;
  return data.user.id;
}

export async function setDevAdmin(on: boolean) {
  const admin = db();
  const userId = await devUserId();
  if (on) {
    const { error } = await admin
      .from("admins")
      .upsert(
        { user_id: userId, note: "local dev" },
        { onConflict: "user_id" },
      );
    if (error) throw error;
  } else {
    const { error } = await admin.from("admins").delete().eq("user_id", userId);
    if (error) throw error;
  }
}

export async function isDevAdmin(): Promise<boolean> {
  const userId = await devUserId();
  const { data } = await db()
    .from("admins")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export const FIXTURES = {
  alpha: {
    slug: "e2e-zephyr-alpha",
    name: "Zephyr Fixture Alpha",
    description: "Drafts a weekly status note from your calendar.",
  },
  beta: {
    slug: "e2e-zephyr-beta",
    name: "Zephyr Fixture Beta",
    description: "Answers common recruiting questions for candidates.",
  },
  pending: {
    slug: "e2e-zephyr-pending",
    name: "Zephyr Fixture Pending",
    description: "Sign up at a link to get free credits.",
    author: "Ada Author",
  },
  declined: {
    slug: "e2e-zephyr-declined",
    name: "Zephyr Fixture Declined",
    description: "Does things.",
    note: "Please describe what the bot does.",
  },
} as const;

// Fixture apps are cursor.directory plugins (shared table) with slugs
// starting "e2e-app-"; their components go with them (on delete cascade).
const APP_SLUG_PREFIX = "e2e-app-";

export const APP_FIXTURES = {
  official: {
    slug: "e2e-app-official",
    name: "Zephyr App Official",
    description: "An official app from the marketplace, for tests.",
    marketplaceId: "990000001",
  },
  community: {
    slug: "e2e-app-community",
    name: "Zephyr App Community",
    description: "A community app with a remote MCP server and a skill.",
    serverUrl: "https://mcp.example.com/zephyr",
  },
  flagged: {
    slug: "e2e-app-flagged",
    name: "Zephyr App Flagged",
    description: "A community app the security scan flagged.",
    summary: "Sends notes to an undisclosed third-party endpoint.",
  },
  pending: {
    slug: "e2e-app-pending",
    name: "Zephyr App Pending",
    description: "A community app waiting for its security check.",
  },
  // Neither of these is an app: one only runs in Cursor, the other is
  // marked as not working in Grok Bot.
  cursorOnly: {
    slug: "e2e-app-cursor-only",
    name: "Zephyr App Cursor Only",
    description: "Rules only; Grok Bot can't use it.",
  },
  notInGrokBot: {
    slug: "e2e-app-not-in-grok-bot",
    name: "Zephyr App Not In Grok Bot",
    description: "The marketplace says it doesn't work in Grok Bot.",
  },
} as const;

export async function removeFixtures() {
  const { error } = await db()
    .from("grok_bots")
    .delete()
    .like("slug", `${SLUG_PREFIX}%`);
  if (error) throw error;
  const { error: appError } = await db()
    .from("plugins")
    .delete()
    .like("slug", `${APP_SLUG_PREFIX}%`);
  if (appError) throw appError;
  // plugin_moderation_events is append-only; events of deleted fixtures stay,
  // tied to ids that no longer exist.
}

async function seedApps(owner: string) {
  const plugin = (
    f: { slug: string; name: string; description: string },
    extra: Record<string, unknown>,
  ) => ({
    slug: f.slug,
    name: f.name,
    description: f.description,
    active: true,
    scan_status: "safe",
    // A multi-row insert sends every column for every row, so defaults
    // don't apply to columns other rows set.
    unavailable_in: [],
    marketplace_categories: [],
    ...extra,
  });
  const { data, error } = await db()
    .from("plugins")
    .insert([
      plugin(APP_FIXTURES.official, {
        discovery_source: "marketplace",
        marketplace_plugin_id: APP_FIXTURES.official.marketplaceId,
        marketplace_categories: ["PRODUCTIVITY"],
        author_name: "Zephyr Labs",
        scan_status: "unscanned",
      }),
      plugin(APP_FIXTURES.community, { owner_id: owner }),
      plugin(APP_FIXTURES.flagged, {
        owner_id: owner,
        active: false,
        scan_status: "flagged",
        flag_severity: "medium",
        flag_summary: APP_FIXTURES.flagged.summary,
        scan_verdict: {
          verdict: "suspicious",
          severity: "medium",
          categories: ["data_exfiltration"],
          reasons: ["Posts every note to an unlisted host."],
          summary: APP_FIXTURES.flagged.summary,
        },
      }),
      plugin(APP_FIXTURES.pending, {
        owner_id: owner,
        active: false,
        scan_status: "pending",
      }),
      plugin(APP_FIXTURES.cursorOnly, {}),
      plugin(APP_FIXTURES.notInGrokBot, {
        discovery_source: "marketplace",
        marketplace_plugin_id: "990000002",
        unavailable_in: ["grok_bot"],
      }),
    ])
    .select("id, slug");
  if (error) throw error;
  const id = (slug: string) => data.find((p) => p.slug === slug)?.id;
  const server = (slug: string, name: string, content: string | null) => ({
    plugin_id: id(slug),
    type: "mcp_server",
    name,
    slug: name,
    content,
  });
  const { error: compError } = await db()
    .from("plugin_components")
    .insert(
      [
        server(APP_FIXTURES.official.slug, "zephyr-official", null),
        {
          ...server(
            APP_FIXTURES.community.slug,
            "zephyr-community",
            JSON.stringify({ url: APP_FIXTURES.community.serverUrl }),
          ),
          // What the server reported when it was submitted.
          metadata: {
            url: APP_FIXTURES.community.serverUrl,
            auth: "oauth",
            tools: [{ name: "zephyr_search", description: "Searches notes." }],
          },
        },
        {
          plugin_id: id(APP_FIXTURES.community.slug),
          type: "skill",
          name: "zephyr-notes",
          slug: "zephyr-notes",
          description: "Writes meeting notes.",
          content: "Write meeting notes from the transcript the user shares.",
        },
        server(
          APP_FIXTURES.flagged.slug,
          "zephyr-flagged",
          JSON.stringify({ url: "https://mcp.example.com/flagged" }),
        ),
        server(APP_FIXTURES.pending.slug, "zephyr-pending", null),
        {
          plugin_id: id(APP_FIXTURES.cursorOnly.slug),
          type: "rule",
          name: "zephyr-rule",
          slug: "zephyr-rule",
        },
        server(APP_FIXTURES.notInGrokBot.slug, "zephyr-hidden", null),
        // A multi-row insert sends every column for every row.
      ].map((row) => ({ metadata: {}, ...row })),
    );
  if (compError) throw compError;
}

/** Puts the fixture bots back in their starting state. */
export async function seedFixtures() {
  await removeFixtures();
  const owner = await devUserId();
  const now = new Date().toISOString();
  const { error } = await db()
    .from("grok_bots")
    .insert([
      {
        ...pick(FIXTURES.alpha),
        share_id: "e2eFixtureAlpha01",
        install_count: 12,
        avatar_shape: "cloud",
        avatar_color: "blue",
        category: "operations",
        status: "listed",
        source: "submission",
        owner_id: owner,
        reviewed_at: now,
        ai_review_status: "safe",
      },
      {
        ...pick(FIXTURES.beta),
        share_id: "e2eFixtureBeta001",
        install_count: 2,
        avatar_shape: "heart",
        avatar_color: "magenta",
        category: "recruiting-people",
        status: "listed",
        source: "marketplace",
        creator_name: "E2E Creator",
        reviewed_at: now,
      },
      {
        ...pick(FIXTURES.pending),
        share_id: "e2eFixturePend001",
        install_count: 0,
        // x.ai named an author other than the submitter.
        creator_name: FIXTURES.pending.author,
        avatar_shape: "square",
        avatar_color: "orange",
        category: "sales",
        status: "pending",
        source: "submission",
        owner_id: owner,
        ai_review_status: "flagged",
        ai_reviewed_at: now,
        ai_review: {
          verdict: "suspicious",
          severity: "medium",
          categories: ["spam"],
          reasons: ["Sends people to an outside sign-up page."],
          summary: "Reads like link bait.",
          category: "sales",
          model: "fixture",
        },
      },
      {
        ...pick(FIXTURES.declined),
        share_id: "e2eFixtureDecl001",
        install_count: 0,
        avatar_shape: "house",
        avatar_color: "green",
        category: "operations",
        status: "declined",
        review_note: FIXTURES.declined.note,
        source: "submission",
        owner_id: owner,
        reviewed_at: now,
      },
    ]);
  if (error) throw error;
  await seedApps(owner);
}

const pick = (f: { slug: string; name: string; description: string }) => ({
  slug: f.slug,
  name: f.name,
  description: f.description,
});

/** Signs in through the local dev login and lands on `next`. */
export async function signIn(page: Page, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Local dev sign-in" }).click();
  await page.waitForURL((url) => url.pathname === next.split("?")[0]);
}

/**
 * An engine bot reacts to the pointer: hovering its card crossfades from
 * the resting face to the second (happy or surprised) face.
 */
export async function expectBotReactsToHover(card: Locator, bot: Locator) {
  const endFace = bot.locator("use[data-face]").nth(1);
  await expect(endFace).toHaveAttribute("opacity", "0");
  await card.hover();
  await expect(endFace).toHaveAttribute("opacity", "1.000");
  await card.page().mouse.move(0, 0);
  await expect(endFace).toHaveAttribute("opacity", "0.000");
}
