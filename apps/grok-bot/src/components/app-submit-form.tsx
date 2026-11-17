"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  previewAppRepo,
  previewMcpServer,
  type RepoPreview,
  type ServerPreview,
  type SubmitAppInput,
  submitApp,
} from "@/actions/submit-app";
import { appContents } from "@/lib/app-categories";
import { formatCount, formatRelativeDate } from "@/lib/format";
import { AppLogo } from "./app-logo";
import { BotRig } from "./bot-rig";

const ERRORS: Record<string, string> = {
  invalid:
    "Paste a GitHub repository (https://github.com/owner/repo) or an MCP server URL (https://…).",
  unreadable:
    "We couldn’t read that repository. Check that it exists and is public.",
  no_components:
    "No MCP servers or skills found. Add an mcp.json or skills/*/SKILL.md to the repository.",
  not_usable:
    "Grok Bot can’t add this as it stands. Every MCP server needs a setup that works as written (a server URL, or an npx, uvx, bunx or docker command with no local paths or blanks), and every skill needs its SKILL.md.",
  unavailable: "Couldn’t reach GitHub. Try again in a moment.",
  github_busy:
    "GitHub is rate-limiting us right now, so we can’t read repositories. Try again in a few minutes.",
  invalid_server: "Use the server’s public https:// address.",
  unreachable:
    "Couldn’t connect to that server. Check the URL and that it’s online.",
  not_mcp:
    "That URL didn’t answer as an MCP server. Use its MCP endpoint, often ending in /mcp.",
  invalid_details:
    "Add a name (2–80 characters) and a description (at least 10 characters). Logo and website must be https:// links.",
  duplicate:
    "An app with this name or repository is already listed or in review.",
  rate_limited: "You’ve submitted a lot recently. Try again later.",
  signed_out: "Your session ended. Sign in again to submit.",
};

type Kind = "empty" | "repo" | "server" | "invalid";

function kindOf(link: string): Kind {
  const value = link.trim();
  if (!value) return "empty";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "invalid";
  }
  if (url.hostname === "github.com" || url.hostname === "www.github.com")
    return /^\/[^/]+\/[^/]+/.test(url.pathname) ? "repo" : "invalid";
  return url.protocol === "https:" ? "server" : "invalid";
}

type Lookup<T> =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: T };

type Details = {
  name: string;
  description: string;
  logo: string;
  homepage: string;
};
const FIELDS = ["name", "description", "logo", "homepage"] as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function AppSubmitForm() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [touched, setTouched] = useState(false);
  const [repo, setRepo] = useState<Lookup<RepoPreview>>({ phase: "idle" });
  const [server, setServer] = useState<Lookup<ServerPreview>>({
    phase: "idle",
  });
  const [details, setDetails] = useState<Details>({
    name: "",
    description: "",
    logo: "",
    homepage: "",
  });
  // Fields the member typed in; the server's suggestions never overwrite them.
  const edited = useRef(new Set<keyof Details>());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pasted = useRef(false);
  const kind = kindOf(link);

  useEffect(() => {
    setSubmitError(null);
    if (kind !== "repo") setRepo({ phase: "idle" });
    if (kind !== "server") setServer({ phase: "idle" });
    if (kind !== "repo" && kind !== "server") return;
    const value = link.trim();
    if (kind === "repo") setRepo({ phase: "loading" });
    else setServer({ phase: "loading" });
    let cancelled = false;
    // Wait for typing to pause; a paste is already whole.
    const delay = pasted.current ? 0 : 500;
    pasted.current = false;
    const t = setTimeout(async () => {
      if (kind === "repo") {
        const result = await previewAppRepo(value).catch(
          (): RepoPreview => ({ ok: false, error: "unavailable" }),
        );
        if (!cancelled) setRepo({ phase: "done", result });
        return;
      }
      const result = await previewMcpServer(value).catch(
        (): ServerPreview => ({ ok: false, error: "unreachable" }),
      );
      if (cancelled) return;
      setServer({ phase: "done", result });
      if (result.ok)
        setDetails((d) => {
          const next = { ...d };
          for (const f of FIELDS)
            if (!edited.current.has(f)) next[f] = result.suggested[f] ?? "";
          return next;
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [link, kind]);

  const setField = (field: keyof Details, value: string) => {
    edited.current.add(field);
    setDetails((d) => ({ ...d, [field]: value }));
  };

  const preview = repo.phase === "done" && repo.result.ok ? repo.result : null;
  const inspected =
    server.phase === "done" && server.result.ok ? server.result : null;
  const existing = preview?.existing ?? null;
  const loading = repo.phase === "loading" || server.phase === "loading";
  const linkError =
    kind === "invalid" && touched
      ? ERRORS.invalid
      : repo.phase === "done" && !repo.result.ok
        ? ERRORS[repo.result.error]
        : server.phase === "done" && !server.result.ok
          ? ERRORS[server.result.error]
          : preview && !preview.usable
            ? ERRORS.not_usable
            : null;
  const serverReady =
    !!inspected &&
    details.name.trim().length >= 2 &&
    details.description.trim().length >= 10;
  const canSubmit =
    !submitting &&
    ((kind === "repo" && !!preview?.usable && !existing) || serverReady);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    const input: SubmitAppInput =
      kind === "repo"
        ? { kind: "repo", url: link.trim() }
        : {
            kind: "server",
            url: link.trim(),
            name: details.name,
            description: details.description,
            logo: details.logo.trim() || undefined,
            homepage: details.homepage.trim() || undefined,
          };
    try {
      const result = await submitApp(input);
      if (result.ok) {
        router.push(`/my-bots?submitted=${encodeURIComponent(result.slug)}`);
        router.refresh();
        return;
      }
      setSubmitError(ERRORS[result.error] ?? "Something went wrong.");
    } catch {
      setSubmitError("Something went wrong. Try again.");
    }
    setSubmitting(false);
  }

  const counts = (parts: { type: string }[]) =>
    appContents(
      parts.filter((p) => p.type === "mcp_server").length,
      parts.filter((p) => p.type === "skill").length,
    );

  // What the server said about itself, for the preview's footer.
  const serverMeta = inspected
    ? inspected.signIn
      ? "Requires sign-in"
      : inspected.tools && inspected.tools.length > 0
        ? `${plural(inspected.tools.length, "tool")}: ${inspected.tools
            .slice(0, 3)
            .map((t) => t.name)
            .join(", ")}${inspected.tools.length > 3 ? ", …" : ""}`
        : "MCP server"
    : "MCP server";

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="app-link">GitHub repository or MCP server URL</label>
        <div className="link-input">
          <input
            id="app-link"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={link}
            disabled={submitting}
            onChange={(e) => setLink(e.target.value)}
            onBlur={() => setTouched(true)}
            onPaste={() => {
              pasted.current = true;
              setTouched(true);
            }}
            placeholder="https://github.com/… or https://mcp.example.com/mcp"
            aria-invalid={!!linkError}
            aria-describedby="app-link-help"
          />
          {loading && (
            <span className="link-state" data-testid="link-loading">
              {kind === "repo" ? "Reading repository…" : "Connecting…"}
            </span>
          )}
        </div>
        <div className="help">
          <div
            className={`hint${linkError ? " is-hidden" : ""}`}
            id={linkError ? undefined : "app-link-help"}
            aria-hidden={!!linkError}
          >
            A repository with an mcp.json or skills/*/SKILL.md, or a remote MCP
            server.
          </div>
          {linkError && (
            <div className="err" id="app-link-help">
              {linkError}
            </div>
          )}
        </div>
      </div>

      {kind === "server" && (
        <>
          <div className="field">
            <label htmlFor="app-name">Name</label>
            <input
              id="app-name"
              value={details.name}
              maxLength={80}
              disabled={submitting}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Acme"
            />
          </div>
          <div className="field">
            <label htmlFor="app-description">Description</label>
            <textarea
              id="app-description"
              rows={3}
              maxLength={2000}
              value={details.description}
              disabled={submitting}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="What your bots can do with it"
            />
          </div>
          <div className="field">
            <label htmlFor="app-logo">Logo URL (optional)</label>
            <input
              id="app-logo"
              type="url"
              value={details.logo}
              disabled={submitting}
              onChange={(e) => setField("logo", e.target.value)}
              placeholder="https://…/logo.png"
            />
          </div>
          <div className="field">
            <label htmlFor="app-homepage">Website (optional)</label>
            <input
              id="app-homepage"
              type="url"
              value={details.homepage}
              disabled={submitting}
              onChange={(e) => setField("homepage", e.target.value)}
              placeholder="https://…"
            />
          </div>
        </>
      )}

      {repo.phase === "loading" ? (
        <div
          className="submit-preview submit-skeleton loading"
          data-testid="submit-skeleton"
          aria-hidden="true"
        >
          <div className="head">
            <span className="sk sk-mark" />
            <div className="sk-lines">
              <span className="sk sk-title" />
              {["100%", "94%", "86%", "48%"].map((w) => (
                <span key={w} className="sk sk-line" style={{ width: w }} />
              ))}
            </div>
          </div>
          <div className="meta">
            <span className="sk sk-meta" />
          </div>
        </div>
      ) : preview || kind === "server" ? (
        <div
          className="submit-preview message-arrive"
          data-testid="app-preview"
        >
          <div className="head">
            <AppLogo
              name={(preview?.name ?? details.name) || "?"}
              logo={preview?.logo ?? (details.logo.trim() || null)}
              size={56}
            />
            <div style={{ minWidth: 0 }}>
              <h2>{(preview?.name ?? details.name) || "Your app"}</h2>
              <p className="desc">
                {(preview?.description ?? details.description) ||
                  "Its description shows here."}
              </p>
            </div>
          </div>
          <div className="meta" data-testid="app-preview-meta">
            {preview ? (
              <>
                <span>
                  {counts(preview.parts) || "No MCP servers or skills"}
                </span>
                {preview.stars !== null && (
                  <span>· ★ {formatCount(preview.stars)}</span>
                )}
                {preview.pushedAt && (
                  <span>· updated {formatRelativeDate(preview.pushedAt)}</span>
                )}
                <span className="meta-link">
                  ·{" "}
                  <a
                    href={preview.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>{preview.repository.replace("https://", "")}</code>
                  </a>
                </span>
              </>
            ) : (
              <span className="meta-tools">
                {server.phase === "loading" ? "Connecting…" : serverMeta}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div
          className="submit-preview submit-outline"
          data-testid="submit-outline"
          aria-hidden="true"
        >
          <BotRig
            shape="blob-front"
            color="black"
            mode="detail"
            outline
            className="outline-bot"
          />
        </div>
      )}

      {preview?.archived && !existing && (
        <div className="already" data-testid="archived-repo">
          <span>
            This repository is archived, so it may no longer be maintained.
          </span>
        </div>
      )}

      {existing && (
        <div className="already" data-testid="already-submitted">
          <span>
            {existing.yours
              ? "You already submitted this app."
              : "This app is already submitted."}
          </span>
          <span>
            {existing.listed ? (
              <Link href={`/apps/${existing.slug}`}>View listing</Link>
            ) : existing.yours ? (
              <Link href="/my-bots">Your submissions</Link>
            ) : (
              "In review"
            )}
          </span>
        </div>
      )}

      <button
        type="submit"
        className="btn btn-lg submit-btn"
        disabled={!canSubmit}
      >
        {submitting ? "Submitting…" : "Submit for review"}
      </button>
      {submitError && <div className="form-error">{submitError}</div>}
    </form>
  );
}
