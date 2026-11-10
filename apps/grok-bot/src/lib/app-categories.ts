// The Cursor Marketplace's curated categories, which Grok Bot shows for apps.
// Community apps have none until they're official.
export const APP_CATEGORIES: { id: string; label: string }[] = [
  { id: "PRODUCTIVITY", label: "Productivity" },
  { id: "INFRASTRUCTURE", label: "Infrastructure" },
  { id: "DATA_ANALYTICS", label: "Data & Analytics" },
  { id: "PAYMENTS", label: "Payments" },
  { id: "INBOX_AND_COLLABORATION", label: "Inbox & Collaboration" },
  { id: "AGENT_ORCHESTRATION", label: "Agent Orchestration" },
  { id: "SALES", label: "Sales" },
  { id: "DESIGN", label: "Design" },
  { id: "DOCUMENTS_AND_FILES", label: "Documents & Files" },
  { id: "RESEARCH", label: "Research" },
  { id: "MARKETING", label: "Marketing" },
  { id: "FINANCE_AND_LEGAL", label: "Finance & Legal" },
  { id: "SCHEDULING", label: "Scheduling" },
  { id: "CUSTOMER_SUPPORT", label: "Customer Support" },
  { id: "CANVAS", label: "Canvas" },
];

const LABELS = new Map(APP_CATEGORIES.map((c) => [c.id, c.label]));

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
