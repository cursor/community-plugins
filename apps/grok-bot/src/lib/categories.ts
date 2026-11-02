// The x.ai/bot marketplace's category catalog (ListPublicGrokBotMarketplace
// Listings → all_categories_order), minus "From Grok Bot Team": this
// directory lists community bots only.
export const CATEGORIES = [
  { id: "sales", label: "Sales" },
  { id: "marketing", label: "Marketing" },
  { id: "recruiting-people", label: "Recruiting & People" },
  { id: "operations", label: "Operations" },
  { id: "engineering", label: "Engineering" },
  { id: "product", label: "Product" },
  { id: "design", label: "Design" },
  { id: "personal", label: "Personal" },
  { id: "customer-success", label: "Customer Success" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [
  CategoryId,
  ...CategoryId[],
];

// When neither Grok nor the keywords place a bot, review can move it.
export const DEFAULT_CATEGORY: CategoryId = "operations";

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function isCategoryId(value: string): value is CategoryId {
  return CATEGORIES.some((c) => c.id === value);
}

/** Marketplace category label ("Recruiting & People") → id, if we list it. */
export function categoryIdForLabel(label: string): CategoryId | null {
  return CATEGORIES.find((c) => c.label === label)?.id ?? null;
}
