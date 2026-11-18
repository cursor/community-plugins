/**
 * Grok Bot's rule for which plugins it can use (it calls them "Apps"): a
 * plugin is usable when it has MCP servers or skills, or has none of the
 * parts only Cursor runs. `list_grok_bot_apps()` applies the same rule in SQL.
 */

const GROK_BOT_TYPES = new Set(["mcp_server", "skill"]);
const CURSOR_ONLY_TYPES = new Set([
  "rule",
  "hook",
  "command",
  "agent",
  "lsp_server",
]);

export function worksInGrokBot(componentTypes: readonly string[]): boolean {
  return (
    componentTypes.some((t) => GROK_BOT_TYPES.has(t)) ||
    !componentTypes.some((t) => CURSOR_ONLY_TYPES.has(t))
  );
}

/**
 * The Cursor Marketplace's curated categories. Official apps carry the
 * marketplace's own (`marketplace_categories`); the security scan picks one
 * for every other plugin (`app_category`), using the hints.
 */
export const APP_CATEGORIES = [
  {
    id: "PRODUCTIVITY",
    label: "Productivity",
    hint: "notes, tasks, project management, personal workflows",
  },
  {
    id: "INFRASTRUCTURE",
    label: "Infrastructure",
    hint: "cloud, hosting, databases, DevOps, CI/CD, monitoring, developer tooling",
  },
  {
    id: "DATA_ANALYTICS",
    label: "Data & Analytics",
    hint: "querying, dashboards, BI, analytics, data pipelines",
  },
  {
    id: "PAYMENTS",
    label: "Payments",
    hint: "payment processing, billing, checkout, crypto wallets",
  },
  {
    id: "INBOX_AND_COLLABORATION",
    label: "Inbox & Collaboration",
    hint: "email, chat, team messaging, shared workspaces",
  },
  {
    id: "AGENT_ORCHESTRATION",
    label: "Agent Orchestration",
    hint: "multi-agent workflows, memory, agent frameworks, automation glue",
  },
  {
    id: "SALES",
    label: "Sales",
    hint: "CRM, leads, prospecting, deal tracking",
  },
  {
    id: "DESIGN",
    label: "Design",
    hint: "UI/UX, design tools, images, diagrams, frontend design",
  },
  {
    id: "DOCUMENTS_AND_FILES",
    label: "Documents & Files",
    hint: "documents, PDFs, spreadsheets, file storage, knowledge bases",
  },
  {
    id: "RESEARCH",
    label: "Research",
    hint: "web search, scraping, papers, docs lookup, market and financial data",
  },
  {
    id: "MARKETING",
    label: "Marketing",
    hint: "SEO, ads, social media, content, campaigns",
  },
  {
    id: "FINANCE_AND_LEGAL",
    label: "Finance & Legal",
    hint: "accounting, invoicing, tax, contracts, compliance",
  },
  {
    id: "SCHEDULING",
    label: "Scheduling",
    hint: "calendars, bookings, meetings",
  },
  {
    id: "CUSTOMER_SUPPORT",
    label: "Customer Support",
    hint: "help desks, tickets, support inboxes",
  },
  {
    id: "CANVAS",
    label: "Canvas",
    hint: "interactive canvases, whiteboards, visual output rendered for the user",
  },
] as const;

export type AppCategoryId = (typeof APP_CATEGORIES)[number]["id"];

export const APP_CATEGORY_IDS = APP_CATEGORIES.map((c) => c.id) as [
  AppCategoryId,
  ...AppCategoryId[],
];

/**
 * An app's categories: the marketplace's for official apps, otherwise the
 * one the security scan picked.
 */
export function appCategories(
  marketplaceCategories: readonly string[] | null,
  appCategory: string | null,
): string[] {
  if (marketplaceCategories?.length) return [...marketplaceCategories];
  return appCategory ? [appCategory] : [];
}

/** The public page for an official app; it opens the app in Grok Bot. */
export function grokBotPluginUrl(marketplacePluginId: string): string {
  return `https://x.ai/bot/plugin/${marketplacePluginId}`;
}

/** The Cursor Marketplace page for an official plugin. */
export function cursorMarketplaceUrl(marketplacePluginId: string): string {
  return `https://cursor.com/marketplace?pluginId=${encodeURIComponent(marketplacePluginId)}`;
}
