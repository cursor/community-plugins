import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Body, type Face, inkForColor } from "@/lib/avatar";

// Open Graph image helpers. Art comes from public/ (bundled into the image
// routes by outputFileTracingIncludes in next.config.mjs).

export const OG_SIZE = { width: 1200, height: 630 };

const PUBLIC = join(process.cwd(), "public");

export async function dataUri(file: string, mime: string): Promise<string> {
  const bytes = await readFile(join(PUBLIC, file));
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** A bot's official face, tinted with its light-theme ink, as a data URI. */
export async function botFaceUri(
  body: Body,
  color: string,
  face: Face = "neutral",
): Promise<string> {
  const svg = await readFile(join(PUBLIC, "bots", body, `${face}.svg`), "utf8");
  const [ink] = inkForColor(color);
  const tinted = svg.replace(/fill="rgb\([^)]*\)"/, `fill="${ink}"`);
  return `data:image/svg+xml;base64,${Buffer.from(tinted).toString("base64")}`;
}

export const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://grok-bot.directory";
