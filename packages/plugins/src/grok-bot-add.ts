import type { SupabaseClient } from "@supabase/supabase-js";
import { type McpSetup, parseMcpSetup } from "./mcp-config";

// How a community app is added to Grok Bot, and whether it can be. An app is
// added through Grok Bot's prefilled-message link (the web twin of
// grokbot://app/v1/prompt): it fills the main agent's message box without
// sending, and the agent's AddMcpServer and skill.write tools then ask the
// user to confirm. The text must be one line of at most 1,000 characters.
//
// Both directories write `plugins.grok_bot_addable` from this, and the Grok
// Bot Directory only lists apps where it is true.
const PROMPT_URL = "https://cursor.com/grok-bot/link/v1/prompt";
const MAX_TEXT = 1000;

/** Where the Grok Bot Directory serves each skill's SKILL.md. */
export const GROK_BOT_DIRECTORY_URL = "https://grok-bot.directory";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * One server, as a sentence the agent can act on. Header and environment
 * values are never included (the link travels wherever it's pasted); only
 * their names, so the agent knows to ask for them.
 */
export function addServerSentence(name: string, setup: McpSetup): string {
  if (setup.kind === "remote") {
    const needs =
      setup.headers.length > 0
        ? ` It needs the ${setup.headers.join(", ")} ${plural(setup.headers.length, "header", "headers")}; ask me for the ${plural(setup.headers.length, "value", "values")}.`
        : "";
    return `Add the MCP server ${setup.url} (call it "${name}").${needs}`;
  }
  const needs =
    setup.env.length > 0
      ? ` It needs the ${setup.env.join(", ")} environment ${plural(setup.env.length, "variable", "variables")}; ask me for the ${plural(setup.env.length, "value", "values")}.`
      : "";
  return `Add the local MCP server "${name}" that runs: ${[setup.command, ...setup.args].join(" ")}.${needs}`;
}

/**
 * One skill, for the agent's skill.write: it fetches the SKILL.md the
 * directory serves (the text the security scan reviewed) and saves it.
 */
export function addSkillSentence(name: string, skillUrl: string): string {
  return `Add the skill "${name}" from ${skillUrl} (fetch it and save it as a skill).`;
}

/** Every skill at once, through the list the directory serves. */
export function addSkillsSentence(count: number, listUrl: string): string {
  return `Add the ${count} skills listed at ${listUrl} (fetch each SKILL.md it links and save it as a skill).`;
}

/** The prefilled-message link, or null when the text doesn't fit. */
export function grokBotPromptUrl(text: string): string | null {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line || line.length > MAX_TEXT) return null;
  return `${PROMPT_URL}?text=${encodeURIComponent(line)}`;
}

/** A part of an app that Grok Bot uses: a skill or an MCP server. */
export type AddPart =
  | {
      type: "skill";
      name: string;
      slug: string;
      /** Its SKILL.md is stored, so the directory can serve it. */
      stored: boolean;
    }
  | { type: "mcp_server"; name: string; setup: McpSetup | null };

type StoredComponent = {
  type: string;
  name: string;
  slug: string;
  content: string | null;
  metadata?: Record<string, unknown> | null;
};

/** The skills and MCP servers among a plugin's stored components. */
export function addParts(components: StoredComponent[]): AddPart[] {
  return components.flatMap((c): AddPart[] => {
    if (c.type === "skill")
      return [
        { type: "skill", name: c.name, slug: c.slug, stored: !!c.content },
      ];
    if (c.type === "mcp_server")
      return [
        {
          type: "mcp_server",
          name: c.name,
          setup: parseMcpSetup(c.name, c.content, c.metadata ?? null),
        },
      ];
    return [];
  });
}

/**
 * The link that adds a community app: one message naming every server and
 * skill. Null unless all of them can be added (so the agent isn't left adding
 * half an app) and the message fits.
 */
export function grokBotAddUrl(
  appSlug: string,
  parts: AddPart[],
  site = GROK_BOT_DIRECTORY_URL,
): string | null {
  const servers: string[] = [];
  const skills: string[] = [];
  for (const part of parts) {
    if (part.type === "skill") {
      if (!part.stored) return null;
      skills.push(
        addSkillSentence(
          part.name,
          `${site}/apps/${appSlug}/skills/${part.slug}/SKILL.md`,
        ),
      );
    } else {
      if (!part.setup) return null;
      servers.push(addServerSentence(part.name, part.setup));
    }
  }
  if (servers.length + skills.length === 0) return null;
  return (
    grokBotPromptUrl([...servers, ...skills].join(" ")) ??
    // When naming every skill doesn't fit, one sentence points at the list.
    (skills.length > 1
      ? grokBotPromptUrl(
          [
            ...servers,
            addSkillsSentence(
              skills.length,
              `${site}/apps/${appSlug}/skills.md`,
            ),
          ].join(" "),
        )
      : null)
  );
}

/**
 * Whether Grok Bot can add a plugin as it is stored. Official apps are added
 * through the marketplace; a community app needs a link for all its parts.
 */
export function grokBotAddable(plugin: {
  slug: string;
  marketplace_plugin_id: string | null;
  components: StoredComponent[];
}): boolean {
  if (plugin.marketplace_plugin_id) return true;
  return grokBotAddUrl(plugin.slug, addParts(plugin.components)) !== null;
}

/**
 * Recomputes `plugins.grok_bot_addable` from what is stored. Call it after
 * anything that writes a plugin's components or its marketplace link.
 */
export async function refreshGrokBotAddable(
  supabase: SupabaseClient,
  pluginId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("plugins")
    .select(
      "slug, marketplace_plugin_id, plugin_components(type, name, slug, content, metadata)",
    )
    .eq("id", pluginId)
    .single();
  if (error) throw new Error(`Reading plugin failed: ${error.message}`);
  const addable = grokBotAddable({
    slug: data.slug,
    marketplace_plugin_id: data.marketplace_plugin_id,
    components: (data.plugin_components ?? []) as StoredComponent[],
  });
  const { error: updateError } = await supabase
    .from("plugins")
    .update({ grok_bot_addable: addable })
    .eq("id", pluginId);
  if (updateError)
    throw new Error(`Saving grok_bot_addable failed: ${updateError.message}`);
  return addable;
}

// The hosted Data API returns at most 100 rows per request.
const PAGE = 100;

export type RefreshSummary = {
  plugins: number;
  /** Among active plugins. */
  addable: number;
  notAddable: number;
  /** Plugins whose stored answer was wrong. */
  becameAddable: number;
  stoppedBeingAddable: number;
};

/**
 * Recomputes `plugins.grok_bot_addable` for every plugin. The column is kept
 * up to date as plugins change; this fills it in the first time and repairs
 * it after the rule or the stored setups change.
 */
export async function refreshAllGrokBotAddable(
  supabase: SupabaseClient,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<RefreshSummary> {
  const change: Record<"true" | "false", string[]> = { true: [], false: [] };
  const summary: RefreshSummary = {
    plugins: 0,
    addable: 0,
    notAddable: 0,
    becameAddable: 0,
    stoppedBeingAddable: 0,
  };
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("plugins")
      .select(
        "id, slug, active, marketplace_plugin_id, grok_bot_addable, plugin_components(type, name, slug, content, metadata)",
      )
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Reading plugins failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      summary.plugins++;
      const addable = grokBotAddable({
        slug: row.slug,
        marketplace_plugin_id: row.marketplace_plugin_id,
        components: (row.plugin_components ?? []) as StoredComponent[],
      });
      if (row.active) summary[addable ? "addable" : "notAddable"]++;
      if (addable !== row.grok_bot_addable)
        change[addable ? "true" : "false"].push(row.id);
    }
  }
  summary.becameAddable = change.true.length;
  summary.stoppedBeingAddable = change.false.length;
  if (dryRun) return summary;
  for (const value of ["true", "false"] as const) {
    const ids = change[value];
    for (let i = 0; i < ids.length; i += PAGE) {
      const { error } = await supabase
        .from("plugins")
        .update({ grok_bot_addable: value === "true" })
        .in("id", ids.slice(i, i + PAGE));
      if (error)
        throw new Error(`Saving grok_bot_addable failed: ${error.message}`);
    }
  }
  return summary;
}
