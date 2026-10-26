/**
 * Plugin security scan.
 *
 * Runs a Cursor SDK Agent against the plugin's repo + inline component content
 * and writes a verdict back to the `plugins` row. Invoked from the queue
 * drain route (`/api/queue/plugin-scans/drain`); enqueued via
 * `enqueuePluginScan` from `./queue.ts`.
 *
 * Errors are partitioned into:
 *   - `FatalScanError` — terminal; the drain route archives the message and
 *     leaves `scan_status='error'` for admin review.
 *   - everything else — retryable; the drain route lets the pgmq visibility
 *     timeout expire so the next cron tick re-reads the message.
 */

import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Agent, CursorAgentError, type RunResult } from "@cursor/sdk";
import { x as extractTar } from "tar";
import { z } from "zod";
import {
  fetchWithRateLimit,
  githubAuthHeaders,
  parseGitHubUrl,
} from "@/lib/github-plugin/parse";
import {
  buildScanPrompt,
  type SimilarPluginRow,
} from "@/lib/plugins/scan-prompt";
import {
  FLAG_CATEGORIES,
  FLAG_SEVERITIES,
  type PluginComponent,
  SCAN_VERDICTS,
  type ScanVerdict,
} from "@/lib/plugins/types";
import { createClient } from "@/utils/supabase/admin-client";

/**
 * Thrown by the scan pipeline for non-recoverable errors (bad config, scan
 * agent ended in a terminal non-`finished` state, malformed verdict). The
 * drain route catches this, archives the queue message, and surfaces the
 * failure as `scan_status='error'` instead of letting the message retry
 * forever.
 */
export class FatalScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalScanError";
  }
}

/**
 * Terminal repo-fetch failure: GitHub deterministically refuses to serve the
 * archive (repo deleted/private/DMCA'd, or larger than our scan budget).
 * Re-fetching won't change the answer, so the scan resolves to a
 * "suspicious / manual review" verdict instead of retrying. Anything else
 * thrown during the archive download (DNS, rate limit, GitHub 5xx) is treated
 * as transient and bubbles out so the queue redelivers the message — an infra
 * hiccup must not permanently flag a legitimate plugin (see
 * cursor/community-plugins#395).
 */
class UnscannableRepoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnscannableRepoError";
  }
}

type ComponentRow = Pick<
  PluginComponent,
  "type" | "name" | "slug" | "description" | "content" | "metadata"
>;

const verdictSchema = z.object({
  verdict: z.enum(SCAN_VERDICTS),
  severity: z.enum(FLAG_SEVERITIES),
  categories: z.array(z.enum(FLAG_CATEGORIES)),
  reasons: z.array(z.string().min(1)).min(0),
  summary: z.string().min(1),
});

type ScanInput = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  repository: string | null;
  homepage: string | null;
  keywords: string[];
  components: Array<
    Pick<
      PluginComponent,
      "type" | "name" | "slug" | "description" | "content"
    > & {
      metadata: Record<string, unknown>;
    }
  >;
};

type LoadResult = {
  plugin: ScanInput;
  prevActive: boolean;
  permanentlyBlocked: boolean;
};

type AgentVerdict = ScanVerdict & { runId: string | null };

export type { SimilarPluginRow } from "@/lib/plugins/scan-prompt";

// Threshold/limit for the duplicate-candidate pass. 0.7 trigram similarity
// catches obvious renames/typo-clones ("Cursor Rules" vs "Cursor Rule") with
// near-zero false positives. We surface up to 5 candidates so the agent can
// reason about clusters of duplicates without blowing up the prompt.
const SIMILAR_THRESHOLD = 0.7;
const SIMILAR_LIMIT = 5;

// Tagged logger so scan-related lines are greppable in the dev terminal
// and in Vercel function logs. Keep messages structured; the second arg
// is dumped as JSON so we don't have to invent a format per call site.
function logInfo(tag: string, msg: string, meta?: Record<string, unknown>) {
  console.log(`[scan:${tag}] ${msg}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
}

function logError(tag: string, msg: string, err: unknown) {
  const detail =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { value: String(err) };
  console.error(`[scan:${tag}] ${msg}`, detail);
}

/**
 * End-to-end scan for a single plugin id. Idempotent: re-reads current row
 * state on every call, so the queue is free to re-deliver the same message.
 *
 * Throws `FatalScanError` for terminal failures (already written
 * `scan_status='error'` itself) and re-throws anything else as a retryable
 * error.
 */
export async function runPluginScan(pluginId: string): Promise<void> {
  logInfo(pluginId, "scan start");

  const loaded = await loadPlugin(pluginId);
  if (!loaded) {
    logInfo(pluginId, "loadPlugin returned null; nothing to scan");
    return;
  }

  const tag = loaded.plugin.slug;

  if (loaded.permanentlyBlocked) {
    logInfo(tag, "permanently blocked; short-circuiting");
    await applyBlockedShortCircuit(pluginId);
    return;
  }

  await markScanning(pluginId);
  try {
    const similar = await findSimilarPlugins(pluginId);
    if (similar.length > 0) {
      logInfo(tag, "candidate duplicates", {
        count: similar.length,
        topSimilarity: similar[0].similarity,
      });
    }
    const verdict = await runSecurityAgent(loaded.plugin, similar);
    await applyVerdict(pluginId, loaded.prevActive, verdict);
    logInfo(tag, "scan complete", {
      verdict: verdict.verdict,
      severity: verdict.severity,
    });
  } catch (err) {
    // Compensation: without this the row stays at scan_status='scanning'
    // forever (no scan_run_id, no flag), which is invisible to admins
    // until the 15-min staleness threshold in getStuckScans() trips.
    // Surfacing as 'error' lets the admin re-scan or delete it.
    const message = err instanceof Error ? err.message : String(err);
    logError(tag, "scan failed; marking scan_status=error", err);
    await markScanFailed(pluginId, message);
    throw err;
  }
}

async function loadPlugin(pluginId: string): Promise<LoadResult | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plugins")
    .select(
      "id, name, slug, description, repository, homepage, keywords, active, permanently_blocked, plugin_components(type, name, slug, description, content, metadata)",
    )
    .eq("id", pluginId)
    .single();

  if (error || !data) return null;

  const components = ((data.plugin_components ?? []) as ComponentRow[]).map(
    (c) => ({
      type: c.type,
      name: c.name,
      slug: c.slug,
      description: c.description,
      content: c.content,
      metadata: (c.metadata ?? {}) as Record<string, unknown>,
    }),
  );

  return {
    prevActive: data.active === true,
    permanentlyBlocked: data.permanently_blocked === true,
    plugin: {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      repository: data.repository,
      homepage: data.homepage,
      keywords: data.keywords ?? [],
      components,
    },
  };
}

async function markScanning(pluginId: string) {
  const supabase = await createClient();
  await supabase
    .from("plugins")
    .update({ scan_status: "scanning" })
    .eq("id", pluginId);
}

/**
 * Top-N active plugins with a name trigram-similar to this one.
 */
async function findSimilarPlugins(
  pluginId: string,
): Promise<SimilarPluginRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_similar_plugins", {
    p_plugin_id: pluginId,
    p_threshold: SIMILAR_THRESHOLD,
    p_limit: SIMILAR_LIMIT,
  });

  if (error) {
    logError(
      pluginId,
      "find_similar_plugins failed (continuing without)",
      error,
    );
    return [];
  }

  return (data ?? []) as SimilarPluginRow[];
}

/**
 * Exported so the drain route can reuse it for the "exceeded MAX_ATTEMPTS"
 * bury path without duplicating the update shape.
 */
export async function markScanFailed(pluginId: string, errorMessage: string) {
  const supabase = await createClient();
  await supabase
    .from("plugins")
    .update({
      scan_status: "error",
      flag_summary: errorMessage.slice(0, 500),
      last_scanned_at: new Date().toISOString(),
    })
    .eq("id", pluginId);
}

async function applyBlockedShortCircuit(pluginId: string) {
  const supabase = await createClient();
  await supabase
    .from("plugins")
    .update({
      active: false,
      scan_status: "flagged",
      flag_summary: "Permanently blocked by an admin.",
      flag_reasons: ["permanently_blocked"],
      flag_severity: "high",
      flagged_at: new Date().toISOString(),
      last_scanned_at: new Date().toISOString(),
    })
    .eq("id", pluginId);
}

// Cap how much of the repo archive we materialize on the function's tmpfs.
// Plugins are typically rules/.md/.json — kilobytes — but we share /tmp with
// other step executions and have a hard ~500MB limit on Vercel.
const REPO_ARCHIVE_MAX_BYTES = 100 * 1024 * 1024;

// The Vercel function sandbox only guarantees a writable /tmp; os.homedir()
// points at a path that may not exist or be read-only (`/home/sbx_user...`).
// The Cursor SDK persists local-agent state under `~/.cursor/projects/...` by
// default, which crashed every scan with `mkdir ENOENT` (see
// cursor/community-plugins#395). A single stable dir — not per-scan — so a
// warm function instance reuses one run store instead of opening a new
// sqlite handle per scan.
const SDK_STATE_HOME = path.join(tmpdir(), "cursor-sdk-home");

/**
 * Point every Cursor SDK state surface at writable tmpfs and return the
 * `stateRoot` to pass to `Agent.prompt`:
 *
 * - `platform.stateRoot` covers the SDK's in-process run/checkpoint stores
 *   (the `sdk-agent-store` path that failed in production).
 * - `HOME` / `CURSOR_CONFIG_DIR` / `CURSOR_DATA_DIR` cover the spawned
 *   `cursor-agent` process and the SDK's remaining `homedir()` fallbacks.
 *
 * Mutating `process.env` is safe here: this module only runs inside the
 * drain route's function, and the values are constants so concurrent
 * invocations in a shared instance can't observe a mix.
 */
async function redirectSdkStateToTmp(): Promise<string> {
  const cursorDir = path.join(SDK_STATE_HOME, ".cursor");
  const stateRoot = path.join(SDK_STATE_HOME, "sdk-agent-store");
  process.env.HOME = SDK_STATE_HOME;
  process.env.CURSOR_CONFIG_DIR = cursorDir;
  process.env.CURSOR_DATA_DIR = cursorDir;
  await mkdir(cursorDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return stateRoot;
}

function archiveSizeGuard(tag: string) {
  let downloaded = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length;
      if (downloaded > REPO_ARCHIVE_MAX_BYTES) {
        callback(
          new UnscannableRepoError(
            `Repository archive exceeded the ${REPO_ARCHIVE_MAX_BYTES}-byte scan limit.`,
          ),
        );
        return;
      }
      callback(null, chunk);
    },
    final(callback) {
      logInfo(tag, "GitHub archive download complete", { downloaded });
      callback();
    },
  });
}

async function cloneRepo(
  owner: string,
  repo: string,
  tag: string,
): Promise<{ cwd: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-scan-"));
  const cwd = path.join(root, "repo");
  const archivePath = path.join(root, "repo.tar.gz");
  const cleanup = () =>
    rm(root, { recursive: true, force: true }).catch(() => {});
  const startedAt = Date.now();
  const archiveUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/HEAD`;
  logInfo(tag, "GitHub archive download start", { owner, repo, cwd });
  try {
    await mkdir(cwd);
    // GITHUB_TOKEN (when configured) lifts the 60 req/hr anonymous rate limit
    // shared across all tenants of the function's egress IP.
    const response = await fetchWithRateLimit(archiveUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "cursor-directory-plugin-scan",
        ...githubAuthHeaders(),
      },
      maxWaitMs: 30_000,
    });

    if ([404, 410, 451].includes(response.status)) {
      throw new UnscannableRepoError(
        `GitHub returned ${response.status} for ${owner}/${repo} — the repository does not exist or is not public.`,
      );
    }

    if (!response.ok || !response.body) {
      throw new Error(
        `GitHub archive request failed with ${response.status} ${response.statusText}`,
      );
    }

    const contentLength = response.headers.get("content-length");
    if (
      contentLength &&
      Number.parseInt(contentLength, 10) > REPO_ARCHIVE_MAX_BYTES
    ) {
      throw new UnscannableRepoError(
        `Repository archive advertised ${contentLength} bytes, above the ${REPO_ARCHIVE_MAX_BYTES}-byte scan limit.`,
      );
    }

    await pipeline(
      Readable.fromWeb(response.body as never),
      archiveSizeGuard(tag),
      createWriteStream(archivePath),
    );

    await extractTar({
      file: archivePath,
      cwd,
      strip: 1,
    });

    logInfo(tag, "GitHub archive extracted", {
      durationMs: Date.now() - startedAt,
    });
    return { cwd, cleanup };
  } catch (err) {
    logError(tag, "GitHub archive setup failed", err);
    await cleanup();
    throw err;
  }
}

async function runSecurityAgent(
  plugin: ScanInput,
  similar: SimilarPluginRow[],
): Promise<AgentVerdict> {
  const tag = plugin.slug;
  logInfo(tag, "runSecurityAgent start", {
    components: plugin.components.length,
    repository: plugin.repository,
    similarCandidates: similar.length,
  });

  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new FatalScanError(
      "CURSOR_API_KEY is not configured; cannot run plugin security scan.",
    );
  }

  const repoMatch = plugin.repository
    ? parseGitHubUrl(plugin.repository)
    : null;

  // The agent runs in `local` mode against a scratch dir on the function's
  // filesystem: either a fresh clone of the user's public repo, or an empty
  // dir when no repo URL was supplied. This deliberately avoids the cloud
  // runtime's GitHub-App-scoped repo permissions, which would require every
  // plugin submitter to install Cursor's GitHub App on their repo — not a
  // workable UX for a public marketplace.
  let cwd: string;
  let cleanup: () => Promise<void>;
  let hasRepo = false;
  try {
    if (repoMatch) {
      const cloned = await cloneRepo(repoMatch.owner, repoMatch.repo, tag);
      cwd = cloned.cwd;
      cleanup = cloned.cleanup;
      hasRepo = true;
    } else {
      cwd = await mkdtemp(path.join(tmpdir(), "plugin-scan-no-repo-"));
      cleanup = () => rm(cwd, { recursive: true, force: true }).catch(() => {});
      logInfo(tag, "no repo URL; using empty cwd", { cwd });
    }
  } catch (err) {
    if (err instanceof UnscannableRepoError) {
      logError(tag, "repo unscannable; returning suspicious verdict", err);
      return {
        verdict: "suspicious",
        severity: "low",
        categories: [],
        reasons: ["repository_clone_failed"],
        summary: `Could not fetch ${plugin.repository}: ${err.message} Manual review required.`,
        runId: null,
      };
    }
    // Transient failure (network, rate limit, GitHub 5xx): rethrow so the
    // drain route leaves the message for pgmq to redeliver instead of
    // permanently flagging the plugin over an infra hiccup.
    logError(tag, "repo fetch failed; treating as retryable", err);
    throw err;
  }

  try {
    const stateRoot = await redirectSdkStateToTmp();
    const prompt = buildScanPrompt(plugin, { hasRepo, similar });
    logInfo(tag, "Agent.prompt start", {
      cwd,
      hasRepo,
      promptChars: prompt.length,
      model: "composer-2",
      stateRoot,
    });

    const agentStartedAt = Date.now();
    let result: RunResult;
    try {
      result = await Agent.prompt(prompt, {
        apiKey,
        model: { id: "composer-2" },
        local: { cwd },
        name: `scan:${plugin.slug}`,
        // Keep the SDK's run store off the (read-only) default home dir.
        // `CursorAgentPlatformOptions` isn't shipped with the SDK's types,
        // so this field is typed as `any` — the runtime contract is
        // `{ stateRoot?: string; workspaceRef?: string }`.
        platform: { stateRoot },
      });
    } catch (err) {
      if (err instanceof CursorAgentError && err.isRetryable) {
        // The drain route's "leave VT to expire" path handles this for us.
        logError(tag, "Agent.prompt retryable error; will retry", err);
        throw err;
      }
      logError(tag, "Agent.prompt non-retryable error", err);
      throw new FatalScanError(
        `Cursor SDK startup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    logInfo(tag, "Agent.prompt finished", {
      runId: result.id,
      status: result.status,
      durationMs: result.durationMs ?? Date.now() - agentStartedAt,
      resultChars: result.result?.length ?? 0,
    });

    if (result.status !== "finished") {
      throw new FatalScanError(
        `Scan run ${result.id} ended with status=${result.status}`,
      );
    }

    const verdict = parseVerdict(result.result ?? "");
    logInfo(tag, "verdict parsed", {
      verdict: verdict.verdict,
      severity: verdict.severity,
      categories: verdict.categories,
    });
    return { ...verdict, runId: result.id };
  } finally {
    await cleanup();
  }
}

function parseVerdict(text: string): ScanVerdict {
  const fenced = text.match(/```json\s*([\s\S]*?)```/gi);
  let candidate: string | null = null;

  if (fenced && fenced.length > 0) {
    const last = fenced[fenced.length - 1];
    candidate = last
      .replace(/```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
  } else {
    const match = text.match(/\{[\s\S]*\}\s*$/);
    if (match) candidate = match[0];
  }

  if (!candidate) {
    throw new FatalScanError("Scan output did not contain a JSON verdict.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new FatalScanError("Scan output JSON could not be parsed.");
  }

  const validated = verdictSchema.safeParse(parsed);
  if (!validated.success) {
    throw new FatalScanError(
      `Scan verdict failed schema validation: ${validated.error.message}`,
    );
  }

  return {
    verdict: validated.data.verdict,
    severity: validated.data.severity,
    categories: validated.data.categories,
    reasons: validated.data.reasons,
    summary: validated.data.summary,
  };
}

async function applyVerdict(
  pluginId: string,
  prevActive: boolean,
  verdict: AgentVerdict,
) {
  const supabase = await createClient();

  const now = new Date().toISOString();
  const baseUpdate = {
    last_scanned_at: now,
    scan_run_id: verdict.runId,
    scan_verdict: {
      verdict: verdict.verdict,
      severity: verdict.severity,
      categories: verdict.categories,
      reasons: verdict.reasons,
      summary: verdict.summary,
    } satisfies ScanVerdict,
  };

  if (verdict.verdict === "safe") {
    await supabase
      .from("plugins")
      .update({
        ...baseUpdate,
        active: true,
        scan_status: "safe",
        flag_summary: null,
        flag_reasons: [],
        flag_severity: null,
        flagged_at: null,
      })
      .eq("id", pluginId);
    return;
  }

  // Severity policy: only delist a previously-live plugin if the new verdict
  // is malicious or high severity. Lower-severity flags surface in the admin
  // queue without yanking the plugin.
  const shouldHide =
    !prevActive ||
    verdict.verdict === "malicious" ||
    verdict.severity === "high";

  await supabase
    .from("plugins")
    .update({
      ...baseUpdate,
      active: !shouldHide,
      scan_status: "flagged",
      flag_summary: verdict.summary,
      flag_reasons: verdict.reasons.length
        ? verdict.reasons
        : verdict.categories,
      flag_severity: verdict.severity,
      flagged_at: now,
    })
    .eq("id", pluginId);
}
