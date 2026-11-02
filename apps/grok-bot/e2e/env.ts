import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Loads apps/grok-bot/.env into process.env without overriding set vars. */
export function loadEnv() {
  // Playwright runs from apps/grok-bot (see the test:e2e script).
  const file = join(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
