"use client";

import { useState } from "react";
import type { SignInMethod } from "@/lib/last-sign-in";
import { createClient } from "@/utils/supabase/client";
import { GithubIcon } from "./icons/github-icon";
import { GoogleIcon } from "./icons/google-icon";
import { XIcon } from "./icons/x-icon";

type Provider = Exclude<SignInMethod, "dev">;

// The first shown provider gets the solid button: X when it's on,
// otherwise GitHub.
const PROVIDERS: [Provider, string, typeof GithubIcon][] = [
  ["x", "Sign in with X", XIcon],
  ["github", "Sign in with GitHub", GithubIcon],
  ["google", "Sign in with Google", GoogleIcon],
];

function LastUsed() {
  return <span className="last-used">Last used</span>;
}

/**
 * Same GitHub and Google sign-in as cursor.directory (apps/cursor
 * github-signin.tsx and google-signin.tsx) through the shared Supabase
 * project, so accounts are the same members on both sites. X (`xSignIn`) is
 * extra and stays off until X is enabled on that project
 * (GROK_BOT_X_SIGN_IN=1).
 */
export function SignInButtons({
  next,
  devLogin,
  xSignIn,
  lastUsed,
}: {
  next: string;
  devLogin: boolean;
  xSignIn: boolean;
  /** Method of this browser's last completed sign-in. */
  lastUsed: SignInMethod | null;
}) {
  const [pending, setPending] = useState<SignInMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = PROVIDERS.filter(([id]) => id !== "x" || xSignIn);

  async function signIn(provider: Provider) {
    setPending(provider);
    setError(null);
    const supabase = createClient();
    const callback = new URLSearchParams({ next, via: provider });
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?${callback}`,
      },
    });
    if (error) {
      setError("Sign-in isn’t available right now. Try again in a moment.");
      setPending(null);
    }
  }

  return (
    <div className="auth-actions">
      {shown.map(([id, label, Icon], i) => (
        <button
          key={id}
          type="button"
          className={`btn btn-lg${i === 0 ? "" : " btn-gray"}${pending === id ? " pending" : ""}`}
          disabled={!!pending}
          onClick={() => signIn(id)}
          data-provider={id}
        >
          <Icon width={16} height={16} />
          {pending === id ? "Signing in…" : label}
          {lastUsed === id && <LastUsed />}
        </button>
      ))}
      {devLogin && (
        <form
          action="/auth/dev-login"
          method="post"
          onSubmit={() => setPending("dev")}
        >
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="btn btn-lg btn-outline"
            disabled={!!pending}
            style={{ width: "100%" }}
          >
            {pending === "dev" ? "Signing in…" : "Local dev sign-in"}
            {lastUsed === "dev" && <LastUsed />}
          </button>
        </form>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
