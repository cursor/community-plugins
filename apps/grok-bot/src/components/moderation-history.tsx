import type { ModerationEvent } from "@/data/bots";
import { formatRelativeDate } from "@/lib/format";

const ACTION: Record<string, string> = {
  list: "Listed",
  decline: "Declined",
  unlist: "Unlisted",
  flag: "Flagged",
  rereview: "Re-ran the AI review",
  edit: "Changed the category",
  // Apps (cursor.directory plugins, moderated from either site).
  approve: "Listed",
  approve_flagged: "Approved after review",
  unpublish: "Unpublished",
  block: "Blocked",
  rescan: "Requested a re-scan",
  verify: "Verified",
  unverify: "Removed verification",
  dismiss_verification_request: "Dismissed verification request",
  delete: "Deleted",
};

function who(e: ModerationEvent): string {
  if (e.source === "ai") return "AI review";
  if (e.source === "system") return "Automatic clean-up";
  return `${e.actor ?? "An admin"}${e.source === "mcp" ? " (MCP)" : ""}`;
}

/** Every moderation decision on a bot: AI, web and MCP. */
export function ModerationHistory({ events }: { events: ModerationEvent[] }) {
  return (
    <details className="history" data-testid="history">
      <summary>History ({events.length})</summary>
      {events.length === 0 ? (
        <p className="muted">No moderation yet.</p>
      ) : (
        <ol>
          {events.map((e) => (
            <li key={e.id}>
              <span className="when">{formatRelativeDate(e.createdAt)}</span>
              <span>
                <b>{ACTION[e.action] ?? e.action}</b> · {who(e)}
                {e.reason && <span className="muted"> · {e.reason}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
