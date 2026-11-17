// Grok Bot share links look like https://x.ai/bot/<shareId>, or the same
// path on grok.com, where x.ai's pages are moving. Other paths under /bot
// are site pages, not bots.
const RESERVED_BOT_PATHS = new Set([
  "marketplace",
  "guides",
  "use-cases",
  "agent",
  "community",
  "download",
  "get",
  "plugin",
]);
const SHARE_ID = /^[A-Za-z0-9_-]{10,40}$/;

export function parseShareId(input: string): string | null {
  const match = input
    .trim()
    .match(
      /^(?:https?:\/\/)?(?:www\.)?(?:x\.ai|grok\.com)\/bot\/([^/?#]+)\/?(?:[?#].*)?$/i,
    );
  const id = match?.[1];
  if (!id || RESERVED_BOT_PATHS.has(id) || !SHARE_ID.test(id)) return null;
  return id;
}

export const isShareId = (id: string) => SHARE_ID.test(id);

/** The public share page; it opens Grok Bot or offers to install it. */
export const shareUrl = (shareId: string) => `https://x.ai/bot/${shareId}`;
