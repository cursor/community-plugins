import type { CategoryId } from "@/lib/categories";
import { DEFAULT_CATEGORY } from "@/lib/categories";

// What each category covers. The AI reviewer (src/lib/ai-review.ts) picks a
// submission's category from these; guessCategory stands in until it has.
export const CATEGORY_HINTS: Record<CategoryId, string> = {
  sales:
    "finding and winning customers: prospecting, outreach, pipeline, deals, pricing",
  marketing: "content, SEO, campaigns, social, brand, audience research",
  "recruiting-people":
    "hiring, candidates, interviews, onboarding, people operations",
  operations:
    "running the company: approvals, finance, spend, vendors, projects, coordination",
  engineering: "code, pull requests, releases, QA, incidents, developer tools",
  product: "feedback, specs, roadmaps, product meetings and updates",
  design: "visual design, Figma, critiques, creative assets",
  personal:
    "one person's own life admin: inbox, calendar, home, reading, money",
  "customer-success":
    "existing customers: support tickets, account health, renewals",
};

const KEYWORDS: Record<CategoryId, string[]> = {
  sales: [
    "prospect",
    "outbound",
    "lead",
    "deal",
    "pipeline",
    "crm",
    "sales",
    "pricing",
    "competitor",
  ],
  marketing: [
    "seo",
    "content",
    "campaign",
    "keyword",
    "social",
    "brand",
    "ads",
    "audience",
    "newsletter",
  ],
  "recruiting-people": [
    "interview",
    "recruit",
    "candidate",
    "hiring",
    "onboarding",
    "talent",
  ],
  operations: [
    "spend",
    "vendor",
    "invoice",
    "finance",
    "approval",
    "saas",
    "project",
    "notion",
    "task",
  ],
  engineering: [
    "pull request",
    "code",
    "deploy",
    "release",
    "bug",
    "engineer",
    "github",
    "api",
    "qa",
  ],
  product: ["product", "feature", "roadmap", "feedback", "spec", "launch"],
  design: ["design", "figma", "critique", "visual", "mockup", "illustration"],
  personal: [
    "personal",
    "calendar",
    "home",
    "receipt",
    "expense",
    "reading",
    "inbox",
    "family",
  ],
  "customer-success": [
    "ticket",
    "support",
    "help desk",
    "zendesk",
    "customer",
    "renewal",
  ],
};

/** A keyword guess, used at submission until the AI review picks one. */
export function guessCategory(name: string, description: string): CategoryId {
  const text = `${name} ${description}`.toLowerCase();
  let best: CategoryId = DEFAULT_CATEGORY;
  let bestScore = 0;
  for (const [id, words] of Object.entries(KEYWORDS) as [
    CategoryId,
    string[],
  ][]) {
    const score = words.filter((w) => text.includes(w)).length;
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}
