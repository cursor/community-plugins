import { APP_CATEGORIES } from "@directories/plugins/apps";

export { APP_CATEGORIES };

const LABELS = new Map<string, string>(
  APP_CATEGORIES.map((c) => [c.id, c.label]),
);

export function appCategoryLabel(id: string): string | null {
  return LABELS.get(id) ?? null;
}

/** The app's first category the directory knows, for bylines. */
export function primaryAppCategory(categories: string[]): string | null {
  return categories.find((c) => LABELS.has(c)) ?? null;
}

/** "2 MCP servers · 3 skills" */
export function appContents(mcpServers: number, skills: number): string {
  const parts = [
    mcpServers > 0 && `${mcpServers} MCP server${mcpServers === 1 ? "" : "s"}`,
    skills > 0 && `${skills} skill${skills === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.join(" · ");
}
