import type { User } from "@supabase/supabase-js";

/** A member's GitHub account, as GitHub named it at their last sign-in. */
export type GitHubAccount = {
  /** GitHub's numeric id for the account; a login can change hands. */
  id: number;
  login: string;
};

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** The GitHub account from a user's GitHub sign-in identity, if they have one. */
export function githubAccountOf(user: User): GitHubAccount | null {
  const identity = user.identities?.find((i) => i.provider === "github");
  const data = identity?.identity_data ?? {};
  const id = Number(data.provider_id ?? data.sub);
  const login = String(data.user_name ?? data.preferred_username ?? "");
  return Number.isInteger(id) && id > 0 && LOGIN.test(login)
    ? { id, login }
    : null;
}
