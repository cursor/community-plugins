"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { type AppModeration, moderateApp } from "@/actions/moderate-app";
import type { AdminApp, AppAdminTab } from "@/data/app-moderation";
import { appContents } from "@/lib/app-categories";
import { formatRelativeDate } from "@/lib/format";
import { AppLogo } from "./app-logo";

const CURSOR_DIRECTORY_URL = "https://cursor.directory";

const ACTIONS: Record<AppAdminTab, [AppModeration, string, string][]> = {
  queue: [
    ["approve", "Approve", "btn btn-sm"],
    ["block", "Block", "btn btn-sm btn-gray"],
    ["rescan", "Re-scan", "btn btn-sm btn-outline"],
  ],
  listed: [
    ["unpublish", "Unpublish", "btn btn-sm btn-gray"],
    ["block", "Block", "btn btn-sm btn-gray"],
    ["rescan", "Re-scan", "btn btn-sm btn-outline"],
  ],
  removed: [
    ["approve", "Relist", "btn btn-sm"],
    ["rescan", "Re-scan", "btn btn-sm btn-outline"],
  ],
};

const BUSY: Record<AppModeration, string> = {
  approve: "Saving…",
  block: "Blocking…",
  rescan: "Starting…",
  unpublish: "Unpublishing…",
};

/** An app (cursor.directory plugin) in the admin, with its scan verdict. */
export function AppReviewCard({
  app,
  tab,
  status,
  children,
}: {
  app: AdminApp;
  tab: AppAdminTab;
  /** Queue state: flagged, error, stuck, scanning or pending. */
  status: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  // Blocking needs a note, so Block first opens the note box.
  const [blocking, setBlocking] = useState(false);
  const [busy, setBusy] = useState<AppModeration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contents = appContents(app.mcpServers, app.skills);

  async function act(action: AppModeration) {
    setError(null);
    if (action === "block" && !note.trim()) {
      setError("Add a note saying why it’s blocked.");
      return;
    }
    setBusy(action);
    const result = await moderateApp({
      appId: app.id,
      action,
      reason: note.trim() || undefined,
    });
    setBusy(null);
    if (!result.ok) {
      setError(
        result.error === "forbidden"
          ? "Only admins can moderate apps."
          : "Couldn’t save that decision.",
      );
      return;
    }
    setNote("");
    setBlocking(false);
    router.refresh();
  }

  return (
    <article
      className="review"
      data-testid="app-review"
      data-app={app.slug}
      data-status={status}
    >
      <span className="sub-mark">
        <AppLogo name={app.name} logo={app.logo} size={48} />
      </span>
      <div className="sub-body">
        <div className="sub-top">
          <h2>
            {app.active ? (
              <a href={`/apps/${app.slug}`}>{app.name}</a>
            ) : (
              app.name
            )}
            {app.official && <span className="app-badge">Official</span>}
          </h2>
          <a
            href={`${CURSOR_DIRECTORY_URL}/plugins/${app.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="muted"
            style={{ fontSize: 13 }}
          >
            On cursor.directory ↗
          </a>
        </div>
        <p className="sub-desc" style={{ WebkitLineClamp: "unset" }}>
          {app.description}
        </p>
        <div className="sub-meta">
          <span>
            {contents && `${contents} · `}
            {app.submitter ? `submitted by ${app.submitter}` : "submitted"}{" "}
            {formatRelativeDate(app.createdAt)}
            {app.repository && (
              <>
                {" · "}
                <a
                  href={app.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Source ↗
                </a>
              </>
            )}
          </span>
        </div>
        <ScanPanel app={app} status={status} />
        {blocking && (
          <textarea
            // biome-ignore lint/a11y/noAutofocus: opened by clicking Block, to write its note
            autoFocus
            placeholder="Why is it blocked? (shown in the history)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Block note"
          />
        )}
        <div className="controls">
          {blocking ? (
            <>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!!busy}
                onClick={() => act("block")}
              >
                {busy === "block" ? BUSY.block : "Block"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={!!busy}
                onClick={() => {
                  setBlocking(false);
                  setNote("");
                  setError(null);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            ACTIONS[tab].map(([action, label, cls]) => (
              <button
                key={action}
                type="button"
                className={cls}
                disabled={
                  !!busy ||
                  (action === "rescan" &&
                    (status === "scanning" || status === "pending"))
                }
                onClick={() =>
                  action === "block" ? setBlocking(true) : act(action)
                }
              >
                {busy === action ? BUSY[action] : label}
              </button>
            ))
          )}
          {error && (
            <span className="form-error" style={{ margin: 0 }}>
              {error}
            </span>
          )}
        </div>
        {children}
      </div>
    </article>
  );
}

const VERDICT_LABEL = {
  safe: ["Scan: Safe", ""],
  suspicious: ["Scan: Suspicious", "warn"],
  malicious: ["Scan: Malicious", "declined"],
} as const;

/** What cursor.directory's security scan concluded. */
function ScanPanel({ app, status }: { app: AdminApp; status: string }) {
  if (app.permanentlyBlocked)
    return (
      <div className="ai-review" data-testid="scan-review">
        <span className="status declined">Blocked</span>
        {app.flagSummary && <p className="muted">{app.flagSummary}</p>}
      </div>
    );
  if (status === "pending" || status === "scanning")
    return (
      <div className="ai-review" data-testid="scan-review">
        <span className="status off">Security scan in progress</span>
      </div>
    );
  if (status === "stuck")
    return (
      <div className="ai-review" data-testid="scan-review">
        <span className="status warn">Scan stuck</span>
        <p className="muted">It hasn’t finished in 15 minutes. Re-scan it.</p>
      </div>
    );
  if (status === "error")
    return (
      <div className="ai-review" data-testid="scan-review">
        <span className="status off">Scan failed</span>
        {app.flagSummary && <p className="muted">{app.flagSummary}</p>}
      </div>
    );
  const verdict = app.scanVerdict;
  if (!verdict)
    return (
      <div className="ai-review" data-testid="scan-review">
        <span className="status off">Not scanned</span>
      </div>
    );
  const [label, cls] = VERDICT_LABEL[verdict.verdict];
  return (
    <div
      className="ai-review"
      data-testid="scan-review"
      data-verdict={verdict.verdict}
    >
      <div className="ai-head">
        <span className={`status ${cls}`}>{label}</span>
        <span className="muted">
          {verdict.severity} severity
          {verdict.categories.length > 0 &&
            ` · ${verdict.categories.join(", ").replaceAll("_", " ")}`}
          {app.lastScannedAt && ` · ${formatRelativeDate(app.lastScannedAt)}`}
        </span>
      </div>
      <p>{verdict.summary}</p>
      {verdict.reasons.length > 0 && (
        <ul>
          {verdict.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
