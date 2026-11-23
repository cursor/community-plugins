"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { claimMyApp } from "@/actions/my-submissions";
import type { ClaimOutcome } from "@/lib/app-claim";

/** How the member's GitHub account relates to the app's repository. */
export type GitHubClaim =
  /** Signed in with the GitHub account the repository is under. */
  | { state: "yours"; login: string }
  /** Signed in with a different GitHub account. */
  | { state: "other"; login: string; owner: string }
  /** Not signed in with GitHub. */
  | { state: "none"; owner: string };

/** Where the file goes. */
export type FileClaim =
  | { kind: "repo"; repository: string; fileName: string }
  | { kind: "server"; addresses: string[] };

type Way = "github" | "file";

/** What the member is told when a try doesn't claim the app. */
function failure(outcome: Exclude<ClaimOutcome, "claimed">, by: Way): string {
  switch (outcome) {
    case "no_proof":
      return by === "github"
        ? "GitHub doesn’t show this repository under your account."
        : "We didn’t find that line there. A new file can take a minute to go live; check the address, then try again.";
    case "github_busy":
      return "GitHub is rate-limiting us right now, so we couldn’t check. Try again in a few minutes.";
    case "not_claimable":
      return "Someone has already claimed this app.";
    default: {
      const unknown: never = outcome;
      return unknown;
    }
  }
}

function CopyLine({ line }: { line: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="btn btn-gray btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(line);
        } catch {
          return;
        }
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/**
 * The two ways to claim an app nobody owns: the GitHub account its
 * repository is under, or a file its maker publishes naming the member.
 */
export function AppClaim({
  appId,
  slug,
  name,
  github,
  file,
  line,
}: {
  appId: string;
  slug: string;
  name: string;
  /** Null for a server, which has no repository. */
  github: GitHubClaim | null;
  file: FileClaim;
  /** The line the file must hold: it names this member. */
  line: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [asked, setAsked] = useState<Way | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const claim = (by: Way) =>
    start(async () => {
      setAsked(by);
      setNote(null);
      const result = await claimMyApp(appId).catch(() => null);
      if (!result) return setNote("That didn’t work. Try again.");
      if (!result.ok)
        return setNote(
          result.error === "rate_limited"
            ? "You’ve tried a lot recently. Try again later."
            : "Your session ended. Sign in again, then try once more.",
        );
      if (result.outcome !== "claimed")
        return setNote(failure(result.outcome, by));
      router.push(`/my-bots?submitted=${encodeURIComponent(slug)}`);
      router.refresh();
    });
  const result = (by: Way) =>
    asked === by &&
    note && (
      <p className="claim-result" role="status" data-testid="claim-result">
        {note}
      </p>
    );

  return (
    <div className="claim" data-testid="app-claim">
      {github && (
        <section className="claim-way" data-testid="claim-github">
          <h2>With your GitHub account</h2>
          {github.state === "yours" ? (
            <>
              <p>
                You’re signed in as <b>github.com/{github.login}</b>, the
                account this repository is under.
              </p>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => claim("github")}
              >
                {busy && asked === "github" ? "Checking…" : `Claim ${name}`}
              </button>
            </>
          ) : (
            <p>
              This repository is under <b>github.com/{github.owner}</b>.{" "}
              {github.state === "other"
                ? `You’re signed in as github.com/${github.login}.`
                : "You aren’t signed in with GitHub."}{" "}
              If that’s your own account, sign out, then sign back in with
              GitHub, and the app is yours. For an organization’s repository,
              use the file.
            </p>
          )}
          {result("github")}
        </section>
      )}

      <section className="claim-way" data-testid="claim-file">
        <h2>{github ? "Or with a file" : "With a file"}</h2>
        {file.kind === "repo" ? (
          <p>
            Add a file named <code>{file.fileName}</code> to the root of{" "}
            <a href={file.repository} target="_blank" rel="noopener noreferrer">
              the repository
            </a>
            , on its default branch, with this line in it:
          </p>
        ) : (
          <>
            <p>
              Publish a text file at{" "}
              {file.addresses.length > 1 ? "either address" : "this address"}{" "}
              with this line in it:
            </p>
            <ul className="claim-addresses">
              {file.addresses.map((address) => (
                <li key={address}>
                  <code>{address}</code>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="claim-line">
          <code data-testid="claim-line">{line}</code>
          <CopyLine line={line} />
        </div>
        <p className="muted">
          The line names your account here, so it only works for you. It isn’t a
          secret, and you can delete the file once the app is yours.
        </p>
        <button
          type="button"
          className={github?.state === "yours" ? "btn btn-gray" : "btn"}
          disabled={busy}
          onClick={() => claim("file")}
        >
          {busy && asked === "file" ? "Checking…" : "Check for the file"}
        </button>
        {result("file")}
      </section>
    </div>
  );
}
