/** Only in-app paths, so a crafted link can't send people elsewhere after sign-in. */
export function safeNextPath(
  next: string | null | undefined,
  origin = "https://grok-bot.directory",
): string {
  if (!next) return "/";
  try {
    const url = new URL(next, origin);
    if (url.origin !== new URL(origin).origin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
