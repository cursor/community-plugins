import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BotArt } from "@/components/bot-art";
import { SignInButtons } from "@/components/sign-in-buttons";
import { getViewer } from "@/lib/auth";
import { devLoginEnabled } from "@/lib/dev-login";
import { readLastSignIn } from "@/lib/last-sign-in";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

const COPY: [prefix: string, copy: string][] = [
  ["/submit", "Sign in to submit your bot. You’ll come right back here."],
  [
    "/my-bots",
    "Sign in to see the bots you’ve submitted and where they are in review.",
  ],
  ["/admin", "Sign in to review submitted bots."],
  ["/apps/", "Sign in to claim or edit your app. You’ll come right back here."],
];

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNextPath(rawNext);
  // Already signed in: go on to where they were headed.
  if (await getViewer()) redirect(next);
  const copy =
    COPY.find(([prefix]) => next.startsWith(prefix))?.[1] ??
    "Submit bots and keep track of them in review.";
  return (
    <section className="auth" data-testid="auth">
      <div className="auth-inner">
        <div className="auth-brand">
          <BotArt
            body="blob"
            color="black"
            face="happy"
            className="auth-mark"
          />
          <h1>Sign in</h1>
        </div>
        <p className="auth-copy" data-testid="auth-copy">
          {copy}
        </p>
        {error && (
          <div className="form-error">Sign-in didn’t complete. Try again.</div>
        )}
        <SignInButtons
          next={next}
          devLogin={devLoginEnabled()}
          xSignIn={process.env.GROK_BOT_X_SIGN_IN === "1"}
          lastUsed={readLastSignIn(await cookies())}
        />
        <p className="auth-alt">
          New here?{" "}
          <a
            href="https://x.ai/bot/guides/getting-started"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the getting started guide
          </a>
        </p>
      </div>
      <p className="auth-terms">
        By continuing, you agree to the{" "}
        <a
          href="https://x.ai/legal/terms-of-service"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms
        </a>{" "}
        and{" "}
        <a
          href="https://x.ai/legal/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>
        .
      </p>
    </section>
  );
}
