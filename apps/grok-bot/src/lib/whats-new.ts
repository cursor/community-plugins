// What has changed for people who list bots and apps, newest first. The
// What's new page shows all of it; a signed-in member is shown what's new
// since they last looked, once, in a card in the corner (whats-new.tsx).
//
// To announce something, add an entry at the top. Its `id` is what a
// browser remembers having seen, so never reuse or change one.

export type Update = {
  id: string;
  /** The day it shipped, `YYYY-MM-DD`. */
  date: string;
  title: string;
  /** One or two plain sentences: what a member can do now. */
  body: string;
  /** Where to go to use it. */
  link?: { href: string; label: string };
};

export const UPDATES: Update[] = [
  {
    id: "claim-apps",
    date: "2026-11-23",
    title: "Claim your app",
    body: "If your app was added to the directory for you, it’s now yours to claim. Open its page and choose “Claim it”, then prove it with your GitHub account or a small file.",
    link: { href: "/?tab=apps", label: "Find your app" },
  },
  {
    id: "edit-refresh-apps",
    date: "2026-11-23",
    title: "Edit and refresh your apps",
    body: "Each listed app under Your submissions has Edit and Refresh. Change its logo and website, or read your repository again after you update it.",
    link: { href: "/my-bots", label: "Your submissions" },
  },
  {
    id: "refresh-bots",
    date: "2026-11-19",
    title: "Refresh your bots",
    body: "Changed your bot on x.ai? Refresh brings its listing up to date. Marketplace bots credited to your X handle are yours when you sign in with X.",
    link: { href: "/my-bots", label: "Your submissions" },
  },
  {
    id: "profiles",
    date: "2026-11-19",
    title: "Profiles",
    body: "Everything you’ve listed is on a public profile you can share.",
  },
];

/** What a browser remembers: the id of the newest update it has shown. */
export const SEEN_KEY = "grok-bot:whats-new-seen";

// The card sits over the page, so it stays small: a member who has never
// looked, or has been away a while, gets the newest two and a link to the rest.
const AT_MOST = 2;

/**
 * The updates to show someone whose browser last saw `seen`: everything
 * newer, newest first, a few at most. None when they're up to date.
 */
export function updatesSince(
  seen: string | null,
  updates: Update[] = UPDATES,
): Update[] {
  const at = seen ? updates.findIndex((u) => u.id === seen) : -1;
  return (at === -1 ? updates : updates.slice(0, at)).slice(0, AT_MOST);
}

/** "Nov 23, 2026" from an update's date. */
export function updateDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
