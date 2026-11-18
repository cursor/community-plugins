// A creator's public handle, the last part of /creators/<handle>. Someone
// who signed in with X goes by "@" and that handle (X checked it, so nobody
// else can take it); everyone else goes by their profile's slug, which is
// theirs on cursor.directory too. A slug never starts with "@", so the two
// can't be confused.

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export function creatorHandle(member: {
  slug: string;
  x_handle: string | null;
}): string {
  return member.x_handle ? `@${member.x_handle}` : member.slug;
}

export const creatorPath = (handle: string) => `/creators/${handle}`;

/** The X handle in "@handle", or null when it isn't one. */
export function xHandleIn(handle: string): string | null {
  const name = handle.startsWith("@") ? handle.slice(1) : null;
  return name && X_HANDLE.test(name) ? name : null;
}

export const isXHandle = (value: string) => X_HANDLE.test(value);

/** "3 bots · 1 app", leaving out a kind there is none of. */
export function listingCounts(bots: number, apps: number): string {
  const part = (n: number, one: string) =>
    n > 0 ? `${n} ${n === 1 ? one : `${one}s`}` : null;
  return [part(bots, "bot"), part(apps, "app")].filter(Boolean).join(" · ");
}
