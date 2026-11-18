// A member's public handle, the last part of their profile's address,
// /u/<handle> (as on cursor.directory, whose profiles these share). Someone
// who signed in with X goes by that handle, which X checked, so it is
// theirs to claim; everyone else goes by their profile's slug, which is
// theirs on cursor.directory too. Both are written plainly: /u/kevinrose,
// /u/pontus.
//
// The two share one set of names, so an address is read as an X handle
// first and a slug second (src/data/creators.ts). If a slug ever equals
// someone else's X handle, the address is the X handle's: signing up under a
// name can't take the address of the person who holds it on X.

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export function creatorHandle(member: {
  slug: string;
  x_handle: string | null;
}): string {
  return member.x_handle ?? member.slug;
}

export const creatorPath = (handle: string) => `/u/${handle}`;

export const isXHandle = (value: string) => X_HANDLE.test(value);

/** "3 bots · 1 app", leaving out a kind there is none of. */
export function listingCounts(bots: number, apps: number): string {
  const part = (n: number, one: string) =>
    n > 0 ? `${n} ${n === 1 ? one : `${one}s`}` : null;
  return [part(bots, "bot"), part(apps, "app")].filter(Boolean).join(" · ");
}
