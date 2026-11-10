import type { McpSetup } from "@directories/plugins/mcp-config";

// Grok Bot's prefilled-message link (the web twin of
// grokbot://app/v1/prompt). It fills the main agent's message box without
// sending; the agent's AddMcpServer tool then asks the user to confirm before
// adding anything. The text must be one line of at most 1,000 characters.
const PROMPT_URL = "https://cursor.com/grok-bot/link/v1/prompt";
const MAX_TEXT = 1000;

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
