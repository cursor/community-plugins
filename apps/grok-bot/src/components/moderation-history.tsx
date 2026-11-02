import type { ModerationEvent } from "@/data/bots";
import { formatRelativeDate } from "@/lib/format";

const ACTION: Record<string, string> = {
  list: "Listed",
  decline: "Declined",
  unlist: "Unlisted",
  flag: "Flagged",
  rereview: "Re-ran the AI review",
  edit: "Changed the category",
};

function who(e: ModerationEvent): string {
  if (e.source === "ai") return "AI review";
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
