import type { User } from "@supabase/supabase-js";

// The ways a member can sign in. An account is whichever one they used:
// GitHub and Google meet on a shared email address, but X gives none, so
// someone who submitted with GitHub and comes back with X is a new, empty
// account. These helpers say which ways an account has, so the site can
// point at the others when a listing seems to be missing.

export const PROVIDERS = ["x", "github", "google"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_NAME: Record<Provider, string> = {
  x: "X",
  github: "GitHub",
  google: "Google",
};

/** The providers this account can sign in with, in the sign-in page's order. */
export function linkedProviders(user: User): Provider[] {
  const linked = new Set(user.identities?.map((i) => i.provider));
  return PROVIDERS.filter((p) => linked.has(p));
}

/** The providers the sign-in page offers that this account has never used. */
export function otherProviders(
  linked: Provider[],
  { xSignIn }: { xSignIn: boolean },
): Provider[] {
  return PROVIDERS.filter((p) => !linked.includes(p) && (p !== "x" || xSignIn));
}

/** "X", "X and Google", "X, GitHub or Google". */
export function listed(providers: Provider[], last: "and" | "or"): string {
  const names = providers.map((p) => PROVIDER_NAME[p]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${last} ${names.at(-1)}`;
}
