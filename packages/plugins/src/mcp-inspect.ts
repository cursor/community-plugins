/**
 * Reads what a pasted remote MCP server says about itself, the way a client
 * does when it connects: the `initialize` handshake (name, title, version,
 * website, icons), its tool list, and whether it wants a sign-in first. When
 * the server says little, its website's own metadata (title, description,
 * icon) fills in.
 *
 * Every request goes to an address someone typed into a public form, so each
 * one is checked first: https only, no credentials in the URL, no private or
 * loopback addresses (after DNS), no redirects, short timeouts, capped bodies.
 * Node only.
 */

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const PROTOCOL_VERSION = "2025-06-18";
const TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_TOOL_PAGES = 3;

export type McpTool = { name: string; description: string };

export type McpInspection =
  | {
      ok: true;
      /** The server's name, title, version and website, as it reports them. */
      server: {
        name: string | null;
        title: string | null;
        version: string | null;
        websiteUrl: string | null;
        icon: string | null;
      };
      /** Null when the server didn't list them (for example before sign-in). */
      tools: McpTool[] | null;
      /** "oauth" when the server answered 401 asking for a sign-in. */
      auth: "none" | "oauth";
      /** The website the metadata below came from, when one answered. */
      website: {
        url: string;
        name: string | null;
        description: string | null;
        icon: string | null;
      } | null;
    }
  | { ok: false; error: "invalid" | "blocked" | "unreachable" | "not_mcp" };

// ---------------------------------------------------------------------------
// Guarded fetch
// ---------------------------------------------------------------------------

const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  PRIVATE.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  PRIVATE.addSubnet(net, prefix, "ipv6");

function isPrivateAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return PRIVATE.check(mapped, "ipv4");
  return PRIVATE.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

class Blocked extends Error {}

/** A public https URL with no credentials, or null. */
export function publicHttpsUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    !host.includes(".") ||
    /\.(local|localhost|internal|lan|home|corp)$/.test(host)
  )
    return null;
  return url;
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress))
    throw new Blocked(host);
}

/**
 * Reads at most MAX_BODY_BYTES. `done` lets a caller stop early: an SSE
 * response can stay open after the reply it carries.
 */
async function readCapped(
  res: Response,
  done?: (text: string) => boolean,
): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
    if (text.length > MAX_BODY_BYTES || done?.(text)) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return text;
}

const MAX_REDIRECTS = 3;

/** `<meta http-equiv="refresh" content="0;url=…">` on a stub page. */
function metaRefreshTarget(html: string): string | null {
  if (html.length > 2_000) return null;
  const tag = html.match(
    /<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/i,
  )?.[0];
  return tag?.match(/url\s*=\s*['"]?([^'">\s]+)/i)?.[1] ?? null;
}

/**
 * Fetches a checked public URL. Redirects (HTTP or meta refresh) are followed
 * only when `follow` is set, and every hop is checked again.
 */
async function guardedFetch(
  url: URL,
  init: RequestInit,
  opts: { follow?: boolean; done?: (text: string) => boolean } = {},
): Promise<{ res: Response; body: string; url: URL }> {
  let current = url;
  for (let hop = 0; ; hop++) {
    await assertPublicHost(current);
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get("location");
    const isRedirect = res.status >= 300 && res.status < 400 && location;
    const body = isRedirect ? "" : await readCapped(res, opts.done);
    const next = isRedirect ? location : metaRefreshTarget(body);
    if (!opts.follow || !next || hop >= MAX_REDIRECTS)
      return { res, body, url: current };
    const target = publicHttpsUrl(new URL(next, current).toString());
    if (!target) return { res, body, url: current };
    current = target;
  }
}

// ---------------------------------------------------------------------------
// MCP (Streamable HTTP, JSON-RPC)
// ---------------------------------------------------------------------------

type JsonRpcReply = {
  id?: number;
  result?: Record<string, unknown>;
  error?: unknown;
};

/** The reply with `id`, whether the server answered JSON or an SSE stream. */
function replyFor(body: string, id: number): JsonRpcReply | null {
  const candidates = body.trimStart().startsWith("{")
    ? [body]
    : body
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());
  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as JsonRpcReply | JsonRpcReply[];
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const match = list.find((m) => m?.id === id);
      if (match) return match;
    } catch {
      // not JSON; keep looking
    }
  }
  return null;
}

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

function httpsIconFrom(icons: unknown, base: URL): string | null {
  if (!Array.isArray(icons)) return null;
  for (const icon of icons as { src?: unknown }[]) {
    const src = str(icon?.src);
    if (!src) continue;
    try {
      const url = new URL(src, base);
      if (url.protocol === "https:") return url.toString();
    } catch {
      // skip
    }
  }
  return null;
}

async function rpc(
  url: URL,
  session: { id: string | null },
  method: string,
  params: Record<string, unknown> | undefined,
  id?: number,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL_VERSION,
    "User-Agent": "GrokBotDirectory/1.0 (+https://grok-bot.directory)",
  };
  if (session.id) headers["Mcp-Session-Id"] = session.id;
  const { res, body } = await guardedFetch(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        ...(params ? { params } : {}),
        ...(id !== undefined ? { id } : {}),
      }),
    },
    { done: (text) => id === undefined || replyFor(text, id) !== null },
  );
  session.id = res.headers.get("mcp-session-id") ?? session.id;
  return { res, reply: id !== undefined ? replyFor(body, id) : null };
}

// ---------------------------------------------------------------------------
// Website metadata
// ---------------------------------------------------------------------------

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? null;

const decode = (text: string) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

function metaContent(html: string, keys: string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && keys.includes(key)) return decode(content) || null;
  }
  return null;
}

/**
 * The site icon that will look best as an app logo: an apple-touch-icon,
 * then an SVG, then the largest declared size. A 16–32px favicon is the
 * last resort.
 */
function iconHref(html: string, base: URL): string | null {
  const links = (html.match(/<link\b[^>]*>/gi) ?? [])
    .map((tag) => ({
      rel: (attr(tag, "rel") ?? "").toLowerCase(),
      href: attr(tag, "href"),
      type: (attr(tag, "type") ?? "").toLowerCase(),
      size: Number((attr(tag, "sizes") ?? "").match(/^(\d+)/)?.[1] ?? 0),
    }))
    .filter((l) => l.href && /(^|\s)(icon|apple-touch-icon)(\s|$)/.test(l.rel));
  const score = (l: (typeof links)[number]) =>
    l.rel.includes("apple-touch-icon")
      ? 3000 + l.size
      : l.type.includes("svg") || /\.svg($|\?)/i.test(l.href ?? "")
        ? 2000
        : l.size;
  const pick = links.sort((a, b) => score(b) - score(a))[0];
  if (!pick?.href) return null;
  try {
    const url = new URL(pick.href, base);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The site's own name, description and icon, from its home page. */
async function inspectWebsite(
  candidates: URL[],
): Promise<Extract<McpInspection, { ok: true }>["website"]> {
  for (const url of candidates) {
    try {
      const {
        res,
        body,
        url: landed,
      } = await guardedFetch(
        url,
        { headers: { Accept: "text/html" } },
        { follow: true, done: (text) => /<\/head>/i.test(text) },
      );
      if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? ""))
        continue;
      const head = body.slice(0, 200_000);
      const title = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
      return {
        url: url.toString(),
        name:
          metaContent(head, ["og:site_name"]) ??
          metaContent(head, ["og:title"]) ??
          (title ? decode(title) || null : null),
        description: metaContent(head, ["description", "og:description"]),
        icon: iconHref(head, landed),
      };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** The server's home page, then the site above an mcp./api. subdomain. */
function websiteCandidates(mcpUrl: URL, reported: string | null): URL[] {
  const out: URL[] = [];
  const add = (raw: string) => {
    const url = publicHttpsUrl(raw);
    if (url && !out.some((u) => u.origin === url.origin)) out.push(url);
  };
  if (reported) add(reported);
  const labels = mcpUrl.hostname.split(".");
  if (labels.length > 2 && /^(mcp|api|server)$/.test(labels[0]))
    add(`https://${labels.slice(1).join(".")}/`);
  add(`${mcpUrl.origin}/`);
  return out;
}

// ---------------------------------------------------------------------------

export type SuggestedDetails = {
  name: string | null;
  description: string | null;
  homepage: string | null;
  logo: string | null;
};

/**
 * Form values from what a server reports: "Astro Docs server" becomes
 * "Astro Docs", a page title like "Linear – The system for…" becomes
 * "Linear".
 */
export function suggestDetails(
  inspection: Extract<McpInspection, { ok: true }>,
): SuggestedDetails {
  const { server, website } = inspection;
  const fromServer = (server.title ?? server.name)
    ?.replace(/[\s-]+(mcp\s*server|mcp|server)$/i, "")
    .trim();
  const fromSite = website?.name?.split(/\s+[–—|·:-]\s+/)[0]?.trim();
  return {
    name: fromServer || fromSite || null,
    description: website?.description ?? null,
    homepage: server.websiteUrl ?? website?.url ?? null,
    logo: server.icon ?? website?.icon ?? null,
  };
}

export async function inspectMcpServer(rawUrl: string): Promise<McpInspection> {
  const url = publicHttpsUrl(rawUrl);
  if (!url) return { ok: false, error: "invalid" };
  const session = { id: null as string | null };

  try {
    const { res, reply } = await rpc(
      url,
      session,
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "grok-bot-directory", version: "1.0.0" },
      },
      1,
    );

    if (res.status === 401) {
      return {
        ok: true,
        server: {
          name: null,
          title: null,
          version: null,
          websiteUrl: null,
          icon: null,
        },
        tools: null,
        auth: "oauth",
        website: await inspectWebsite(websiteCandidates(url, null)),
      };
    }

    const result = reply?.result;
    const info = result?.serverInfo as Record<string, unknown> | undefined;
    if (!res.ok || !result || !info) return { ok: false, error: "not_mcp" };

    const server = {
      name: str(info.name),
      title: str(info.title),
      version: str(info.version),
      websiteUrl:
        publicHttpsUrl(str(info.websiteUrl) ?? "")?.toString() ?? null,
      icon: httpsIconFrom(info.icons, url),
    };

    let tools: McpTool[] | null = null;
    try {
      await rpc(url, session, "notifications/initialized", undefined);
      const listed: McpTool[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < MAX_TOOL_PAGES; page++) {
        const { reply: toolsReply } = await rpc(
          url,
          session,
          "tools/list",
          cursor ? { cursor } : {},
          2 + page,
        );
        const pageTools = toolsReply?.result?.tools;
        if (!Array.isArray(pageTools)) break;
        for (const t of pageTools as Record<string, unknown>[]) {
          const name = str(t?.name);
          if (name)
            listed.push({
              name,
              description: (str(t.description) ?? "").slice(0, 300),
            });
        }
        cursor = str(toolsReply?.result?.nextCursor);
        if (!cursor) break;
      }
      tools = listed;
    } catch {
      // Tools are a bonus; the handshake already proved it's an MCP server.
    }

    return {
      ok: true,
      server,
      tools,
      auth: "none",
      website: await inspectWebsite(websiteCandidates(url, server.websiteUrl)),
    };
  } catch (err) {
    if (err instanceof Blocked) return { ok: false, error: "blocked" };
    return { ok: false, error: "unreachable" };
  }
}
