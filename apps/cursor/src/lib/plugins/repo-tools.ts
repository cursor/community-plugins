import "server-only";

import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { FunctionToolCall, InputItem, Tool } from "@xai-official/sdk";

/**
 * Read-only tools the security scan gives Grok for the plugin's downloaded
 * repository. The repository is untrusted, so nothing in it is executed:
 * the model can only list, read and search files under the repository root.
 * Symlinks are reported but never followed, and every output is capped.
 */

const MAX_READ_BYTES = 48 * 1024;
const MAX_LIST_ENTRIES = 300;
const MAX_TREE_ENTRIES = 400;
const MAX_SEARCH_MATCHES = 60;
const MAX_SEARCH_FILES = 5_000;
const MAX_SEARCH_FILE_BYTES = 1024 * 1024;
// Patterns come from the model and lines from the repository; bounding the
// line length bounds how long one regex test can run.
const MAX_SEARCH_LINE_CHARS = 4_000;
const MAX_MATCH_CHARS = 300;

export const REPO_TOOLS: Tool[] = [
  {
    type: "function",
    name: "list_files",
    description:
      'Lists one directory of the repository (not recursive): each entry\'s path, type (file, dir or symlink) and size in bytes. Use "." for the root.',
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory, relative to the root.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "read_file",
    description: `Reads a text file from start_line (1-based), up to ${MAX_READ_BYTES / 1024} KB at a time. When the result says truncated, call again with next_line.`,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File, relative to the root." },
        start_line: { type: "integer", minimum: 1 },
      },
      required: ["path", "start_line"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "search",
    description: `Searches text files under a directory for a case-insensitive JavaScript regular expression and returns up to ${MAX_SEARCH_MATCHES} matching lines as path:line: text.`,
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: {
          type: "string",
          description:
            'Directory to search, relative to the root ("." for all).',
        },
      },
      required: ["pattern", "path"],
      additionalProperties: false,
    },
  },
];

class ToolError extends Error {}

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

const isBinary = (bytes: Uint8Array) => bytes.includes(0);

export function repoTools(root: string) {
  let realRoot: string | null = null;

  /** An absolute path inside the root, or a ToolError. */
  async function resolve(relative: unknown): Promise<string> {
    if (typeof relative !== "string")
      throw new ToolError("path must be a string");
    realRoot ??= await realpath(root);
    const abs = path.resolve(realRoot, relative);
    if (abs !== realRoot && !abs.startsWith(realRoot + path.sep))
      throw new ToolError("path is outside the repository");
    let real: string;
    try {
      real = await realpath(abs);
    } catch {
      throw new ToolError(`${relative} does not exist`);
    }
    if (real !== abs)
      throw new ToolError(`${relative} is a symlink; not followed`);
    return abs;
  }

  const rel = (abs: string) => path.relative(realRoot ?? root, abs) || ".";

  async function listFiles(args: Record<string, unknown>) {
    const dir = await resolve(args.path);
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => {
      throw new ToolError(`${String(args.path)} is not a directory`);
    });
    const shown = await Promise.all(
      entries.slice(0, MAX_LIST_ENTRIES).map(async (e) => {
        const abs = path.join(dir, e.name);
        const type = e.isSymbolicLink()
          ? "symlink"
          : e.isDirectory()
            ? "dir"
            : "file";
        const size = type === "file" ? (await lstat(abs)).size : undefined;
        return {
          path: rel(abs),
          type,
          ...(size === undefined ? {} : { size }),
        };
      }),
    );
    return { entries: shown, truncated: entries.length > MAX_LIST_ENTRIES };
  }

  async function readFile(args: Record<string, unknown>) {
    const file = await resolve(args.path);
    const start = Math.max(1, Math.floor(Number(args.start_line) || 1));
    const info = await lstat(file);
    if (!info.isFile())
      throw new ToolError(`${String(args.path)} is not a file`);
    const text = await readText(file, info.size);
    if (text === null) return { binary: true, size: info.size };
    const lines = text.split("\n");
    let bytes = 0;
    let end = start - 1;
    while (
      end < lines.length &&
      bytes + lines[end].length + 1 <= MAX_READ_BYTES
    ) {
      bytes += lines[end].length + 1;
      end++;
    }
    // A single line longer than the budget still returns its first part.
    const content =
      end === start - 1 && start <= lines.length
        ? lines[start - 1].slice(0, MAX_READ_BYTES)
        : lines.slice(start - 1, end).join("\n");
    const next = Math.max(end, start) + 1;
    return {
      content,
      total_lines: lines.length,
      truncated: next <= lines.length,
      ...(next <= lines.length ? { next_line: next } : {}),
    };
  }

  async function search(args: Record<string, unknown>) {
    if (typeof args.pattern !== "string" || !args.pattern)
      throw new ToolError("pattern must be a non-empty string");
    let re: RegExp;
    try {
      re = new RegExp(args.pattern, "i");
    } catch (err) {
      throw new ToolError(`invalid pattern: ${(err as Error).message}`);
    }
    const base = await resolve(args.path);
    const matches: string[] = [];
    let filesSearched = 0;
    for await (const file of walk(base)) {
      if (
        matches.length >= MAX_SEARCH_MATCHES ||
        filesSearched >= MAX_SEARCH_FILES
      )
        break;
      const info = await lstat(file);
      if (info.size > MAX_SEARCH_FILE_BYTES) continue;
      const text = await readText(file, info.size);
      filesSearched++;
      if (text === null) continue;
      const lines = text.split("\n");
      for (
        let i = 0;
        i < lines.length && matches.length < MAX_SEARCH_MATCHES;
        i++
      ) {
        const line = lines[i].slice(0, MAX_SEARCH_LINE_CHARS);
        if (re.test(line))
          matches.push(
            `${rel(file)}:${i + 1}: ${line.trim().slice(0, MAX_MATCH_CHARS)}`,
          );
      }
    }
    return {
      matches,
      truncated:
        matches.length >= MAX_SEARCH_MATCHES ||
        filesSearched >= MAX_SEARCH_FILES,
    };
  }

  const handlers: Record<
    string,
    (args: Record<string, unknown>) => Promise<unknown>
  > = {
    list_files: listFiles,
    read_file: readFile,
    search,
  };

  return {
    /** Runs one call; errors go back to the model instead of throwing. */
    async run(call: FunctionToolCall): Promise<InputItem> {
      let output: unknown;
      try {
        const handler = handlers[call.name];
        if (!handler) throw new ToolError(`unknown tool ${call.name}`);
        output = await handler(record(JSON.parse(call.arguments)));
      } catch (err) {
        output = {
          error: err instanceof ToolError ? err.message : "the tool failed",
        };
      }
      return {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(output),
      };
    },

    /** Every file path with its size, for the first prompt. */
    async tree(): Promise<{ files: string[]; truncated: boolean }> {
      realRoot ??= await realpath(root);
      const files: string[] = [];
      for await (const file of walk(realRoot)) {
        if (files.length >= MAX_TREE_ENTRIES) return { files, truncated: true };
        files.push(`${rel(file)} (${(await lstat(file)).size} bytes)`);
      }
      return { files, truncated: false };
    },
  };
}

/** Regular files under dir, depth first, skipping .git and symlinks. */
async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (e.name !== ".git") yield* walk(abs);
    } else if (e.isFile()) {
      yield abs;
    }
  }
}

/** The file as UTF-8 text, or null when it looks binary. */
async function readText(file: string, size: number): Promise<string | null> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(Math.min(size, MAX_SEARCH_FILE_BYTES * 4));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    if (isBinary(bytes.subarray(0, 8192))) return null;
    return bytes.toString("utf8");
  } finally {
    await handle.close();
  }
}
