// Per-tool presentation. What to extract follows Kana's TUI (src/tui/tools); how it looks
// is Remote's own. Kana-owned tools get specific wording and blocks; any other tool,
// including MCP and future ones, falls back to its name, a best-effort target, and raw
// arguments and output.

import { formatDue } from "../state/agenda";

export type ToolPhase = "running" | "done" | "failed" | "canceled";

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface DiffRow {
  type: "context" | "added" | "removed";
  text: string;
}

export interface FileEntry {
  name: string;
  directory: boolean;
  size?: number;
}

export interface MatchGroup {
  path: string;
  rows: { line: number; text: string }[];
}

export type ToolBlock =
  | { kind: "code"; label: string; text: string }
  | { kind: "text"; label: string; text: string }
  | { kind: "markdown"; label: string; text: string }
  | { kind: "terminal"; command: string; output?: string }
  | { kind: "lines"; label: string; start: number; lines: string[] }
  | { kind: "fields"; rows: [label: string, value: string][] }
  | { kind: "catalog"; items: { name: string; description: string }[]; truncated: boolean }
  | { kind: "diff"; label: string; rows: DiffRow[] }
  | { kind: "matches"; groups: MatchGroup[]; truncated: boolean }
  | { kind: "files"; entries: FileEntry[]; truncated: boolean }
  | { kind: "todos"; items: TodoItem[] }
  | { kind: "error"; text: string };

export interface ToolCallInput {
  name: string;
  args: unknown;
}

export interface ToolOutcome {
  /** Structured tool result, e.g. `{stdout, stderr, exitCode}` for shell. */
  result?: unknown;
  /** Model-facing text content of the result. */
  content?: string;
  isError?: boolean;
  artifact?: { locator: string; byteLength: number };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function string(value: unknown, key: string): string | undefined {
  const field = record(value)?.[key];
  return typeof field === "string" ? field : undefined;
}
function number(value: unknown, key: string): number | undefined {
  const field = record(value)?.[key];
  return typeof field === "number" ? field : undefined;
}
function boolean(value: unknown, key: string): boolean | undefined {
  const field = record(value)?.[key];
  return typeof field === "boolean" ? field : undefined;
}
function array(value: unknown, key: string): unknown[] | undefined {
  const field = record(value)?.[key];
  return Array.isArray(field) ? field : undefined;
}

export function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_024) return plural(bytes, "byte");
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

function lines(value: string): string[] {
  const trimmed = value.replace(/\s+$/, "");
  return trimmed ? trimmed.split(/\r?\n/) : [];
}

const diffLimit = 250_000;

/** Line diff by longest common subsequence; huge inputs fall back to remove-all/add-all. */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = lines(before);
  const b = lines(after);
  const removed = (text: string): DiffRow => ({ type: "removed", text });
  const added = (text: string): DiffRow => ({ type: "added", text });
  if (a.length * b.length > diffLimit) return [...a.map(removed), ...b.map(added)];
  const common = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      common[i][j] =
        a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ type: "context", text: a[i] });
      i++;
      j++;
    } else if (common[i + 1][j] >= common[i][j + 1]) rows.push(removed(a[i++]));
    else rows.push(added(b[j++]));
  }
  return [...rows, ...a.slice(i).map(removed), ...b.slice(j).map(added)];
}

function prose(label: string, value: string | undefined): ToolBlock[] {
  return value?.trim() ? [{ kind: "text", label, text: value.trim() }] : [];
}

function waitTime(ms: number | undefined): string | undefined {
  return ms ? `${ms / 1_000}s` : undefined;
}

function todoItems(value: unknown): TodoItem[] | undefined {
  const items = array(value, "items");
  if (!items) return undefined;
  const parsed = items.filter(
    (item): item is TodoItem =>
      typeof string(item, "content") === "string" &&
      ["pending", "in_progress", "completed"].includes(string(item, "status") ?? ""),
  );
  return parsed.length === items.length ? parsed : undefined;
}

function todoTarget(items: TodoItem[]): string | undefined {
  if (!items.length) return undefined;
  const count = (status: TodoItem["status"]) =>
    items.filter((item) => item.status === status).length;
  const active = items.find((item) => item.status === "in_progress");
  return [
    `${count("in_progress")} active · ${count("pending")} pending · ${count("completed")} completed`,
    active?.content.replace(/\s+/g, " ").trim(),
  ]
    .filter(Boolean)
    .join(" · ");
}

function edits(args: unknown): { oldText: string; newText: string }[] {
  return (array(args, "edits") ?? []).flatMap((edit) => {
    const oldText = string(edit, "oldText");
    const newText = string(edit, "newText");
    return oldText === undefined || newText === undefined ? [] : [{ oldText, newText }];
  });
}

const fallbackTargetFields = [
  "command",
  "path",
  "file_path",
  "pattern",
  "query",
  "url",
  "description",
];

/** The object a tool acted on: a command, a path, a pattern, … */
export function toolTarget(call: ToolCallInput, result?: unknown): string | undefined {
  const { name, args } = call;
  switch (name) {
    case "shell":
    case "job_start":
      return string(args, "command");
    case "list":
    case "read":
    case "view_image":
    case "write":
    case "edit":
      return string(result, "path") ?? string(args, "path");
    case "glob":
    case "grep":
      return string(args, "pattern");
    case "remember":
      return string(result, "scope") ?? string(args, "scope") ?? "project";
    case "schedule_wake": {
      const minutes = number(args, "afterMinutes");
      return minutes === undefined ? undefined : `in ${plural(minutes, "minute")}`;
    }
    case "update_goal":
      return string(args, "status");
    case "todo_write":
      return todoTarget(todoItems(args) ?? []);
    case "mcp_call":
    case "mcp_get_tool":
      return `${string(args, "server") ?? "?"}/${string(args, "tool") ?? "?"}`;
    case "mcp_list_tools":
      return string(args, "name");
    case "job_output":
    case "job_kill":
      return string(args, "jobId");
    case "spawn_subagent":
      return string(args, "profile");
    case "wait_subagent":
    case "cancel_subagent":
      return string(args, "agentId");
    case "run_code":
    case "job_list":
      return undefined;
    default:
      for (const field of fallbackTargetFields) {
        const value = string(args, field);
        if (value) return value;
      }
      return undefined;
  }
}

interface Wording {
  action: string;
  done: string;
  running: string;
  approval: string;
}

function wording(call: ToolCallInput, result: unknown): Wording {
  const { name, args } = call;
  switch (name) {
    case "shell":
      return { action: "run", done: "Ran", running: "Running", approval: "run a shell command" };
    case "job_start":
      return {
        action: "start job",
        done: "Started job",
        running: "Starting job",
        approval: "start a background job",
      };
    case "job_list":
      return {
        action: "list jobs",
        done: "Listed jobs",
        running: "Listing jobs",
        approval: "list background jobs",
      };
    case "job_output":
      return {
        action: "read job output",
        done: "Read job output",
        running: "Reading job output",
        approval: "read background job output",
      };
    case "job_kill":
      return {
        action: "stop job",
        done: "Stopped job",
        running: "Stopping job",
        approval: "stop a background job",
      };
    case "spawn_subagent":
      return {
        action: "start subagent",
        done: "Started subagent",
        running: "Starting subagent",
        approval: "start a subagent",
      };
    case "wait_subagent":
      return {
        action: "wait for subagent",
        done: "Checked subagent",
        running: "Waiting for subagent",
        approval: "wait for a subagent",
      };
    case "cancel_subagent":
      return {
        action: "cancel subagent",
        done: "Canceled subagent",
        running: "Canceling subagent",
        approval: "cancel a subagent",
      };
    case "read":
      return { action: "read", done: "Read", running: "Reading", approval: "read a file" };
    case "list":
      return { action: "list", done: "Listed", running: "Listing", approval: "list a directory" };
    case "glob":
      return { action: "match", done: "Matched", running: "Matching", approval: "find paths" };
    case "grep":
      return { action: "search", done: "Searched", running: "Searching", approval: "search files" };
    case "view_image":
      return { action: "view", done: "Viewed", running: "Viewing", approval: "view an image" };
    case "write":
      return boolean(args, "overwrite")
        ? {
            action: "overwrite",
            done: "Overwrote",
            running: "Overwriting",
            approval: "overwrite a file",
          }
        : { action: "create", done: "Created", running: "Creating", approval: "create a file" };
    case "edit":
      return { action: "edit", done: "Edited", running: "Editing", approval: "edit a file" };
    case "run_code":
      return {
        action: "run code",
        done: "Ran code",
        running: "Running code",
        approval: "run code",
      };
    case "remember":
      return {
        action: "save memory",
        done: "Saved memory",
        running: "Saving memory",
        approval: "save a memory",
      };
    case "schedule_wake":
      return {
        action: "schedule wake",
        done: "Scheduled wake",
        running: "Scheduling wake",
        approval: "schedule a wake",
      };
    case "update_goal":
      return {
        action: "update goal",
        done: string(args, "status") === "completed" ? "Completed goal" : "Blocked goal",
        running: "Updating goal",
        approval: "update the goal",
      };
    case "todo_write":
      return {
        action: "update todos",
        done:
          string(result, "status") === "cleared" || todoItems(args)?.length === 0
            ? "Cleared todos"
            : "Updated todos",
        running: "Updating todos",
        approval: "update todos",
      };
    case "mcp_call":
      return {
        action: "call MCP",
        done: "Called MCP",
        running: "Calling MCP",
        approval: "use an MCP tool",
      };
    case "mcp_get_tool":
      return {
        action: "describe MCP",
        done: "Described MCP",
        running: "Describing MCP",
        approval: "read MCP tool details",
      };
    case "mcp_list_tools":
      return {
        action: "list MCP tools",
        done: "Listed MCP tools",
        running: "Listing MCP tools",
        approval: "read an MCP catalog",
      };
    default:
      return {
        action: `use ${name}`,
        done: `Used ${name}`,
        running: `Using ${name}`,
        approval: `use ${name}`,
      };
  }
}

/** Failure and cancellation are shown by the row's icon, so the wording stays a plain verb. */
export function toolLabel(call: ToolCallInput, phase: ToolPhase, result?: unknown): string {
  const text = wording(call, result);
  return phase === "running" ? text.running : text.done;
}

export function approvalTitle(call: ToolCallInput, requester: string): string {
  return `Allow ${requester} to ${wording(call, undefined).approval}?`;
}

/** Short secondary fact for the collapsed row: counts, sizes, exit codes. */
export function toolMeta(call: ToolCallInput, outcome: ToolOutcome): string | undefined {
  const { name, args } = call;
  const { result } = outcome;
  if (outcome.artifact) return formatBytes(outcome.artifact.byteLength);
  switch (name) {
    case "shell": {
      if (boolean(result, "timedOut")) return "timed out";
      const exitCode = number(result, "exitCode");
      return exitCode ? `exit ${exitCode}` : undefined;
    }
    case "edit": {
      const rows = edits(args).flatMap((edit) => diffLines(edit.oldText, edit.newText));
      if (!rows.length) return undefined;
      const count = (type: DiffRow["type"]) => rows.filter((row) => row.type === type).length;
      return `+${count("added")} −${count("removed")}`;
    }
    case "write": {
      const bytes = number(result, "bytesWritten");
      return bytes === undefined ? undefined : formatBytes(bytes);
    }
    case "read": {
      const start = number(result, "startLine");
      const end = number(result, "endLine");
      const total = number(result, "totalLines");
      return start !== undefined && end !== undefined && total !== undefined
        ? `${start}–${end} of ${total}`
        : undefined;
    }
    case "list": {
      const entries = array(result, "entries")?.length;
      return entries === undefined ? undefined : plural(entries, "entry", "entries");
    }
    case "glob":
    case "grep": {
      const matches = array(result, "matches")?.length;
      return matches === undefined
        ? undefined
        : `${plural(matches, "match", "matches")}${boolean(result, "truncated") ? "+" : ""}`;
    }
    case "run_code": {
      const calls = array(result, "calls")?.length;
      return calls === undefined ? undefined : plural(calls, "call");
    }
    case "job_list": {
      const jobs = Array.isArray(result) ? result : undefined;
      return jobs === undefined ? undefined : plural(jobs.length, "job");
    }
    case "job_output":
    case "job_kill": {
      const status = string(result, "status");
      const exitCode = number(result, "exitCode");
      return status && exitCode !== undefined && status !== "running"
        ? `${status} · exit ${exitCode}`
        : status;
    }
    case "spawn_subagent":
      return string(result, "agentId");
    case "wait_subagent":
    case "cancel_subagent": {
      const status = string(result, "status");
      return status === "running" && boolean(result, "waitTimedOut") ? "still running" : status;
    }
    case "view_image": {
      const mimeType = string(result, "mimeType");
      const width = number(result, "width");
      const height = number(result, "height");
      const bytes = number(result, "byteSize");
      return (
        [
          mimeType?.replace(/^image\//, "").toUpperCase(),
          width !== undefined && height !== undefined ? `${width}×${height}` : undefined,
          bytes === undefined ? undefined : formatBytes(bytes),
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      );
    }
    case "schedule_wake": {
      const dueAt = string(result, "dueAt");
      if (!dueAt || Number.isNaN(new Date(dueAt).getTime())) return undefined;
      const time = formatDue(dueAt);
      return /^\d/.test(time) ? `at ${time}` : time;
    }
    default:
      return undefined;
  }
}

/** What the tool was asked to do. Approval shows these in full. */
export function inputBlocks(call: ToolCallInput): ToolBlock[] {
  const { name, args } = call;
  const fields = (rows: [string, string | undefined][]): ToolBlock[] => {
    const present = rows.filter((row): row is [string, string] => Boolean(row[1]));
    return present.length ? [{ kind: "fields", rows: present }] : [];
  };
  switch (name) {
    case "shell":
    case "job_start": {
      const command = string(args, "command");
      return [
        ...(command === undefined ? [] : [{ kind: "terminal", command } as const]),
        ...fields([
          ["Directory", string(args, "cwd")],
          [
            "Timeout",
            number(args, "timeoutMs") === undefined ? undefined : `${number(args, "timeoutMs")} ms`,
          ],
        ]),
      ];
    }
    case "write": {
      const content = string(args, "content");
      return [
        ...fields([["Path", string(args, "path")]]),
        ...(content === undefined
          ? []
          : [{ kind: "lines", label: "Content", start: 1, lines: lines(content) } as const]),
      ];
    }
    case "edit":
      return [
        ...fields([["Path", string(args, "path")]]),
        ...edits(args).map(
          (edit, index, all) =>
            ({
              kind: "diff",
              label: all.length > 1 ? `Change ${index + 1}` : "Change",
              rows: diffLines(edit.oldText, edit.newText),
            }) as const,
        ),
      ];
    case "read": {
      const offset = number(args, "offset");
      const limit = number(args, "limit");
      return fields([
        ["Path", string(args, "path")],
        [
          "Lines",
          offset === undefined && limit === undefined
            ? undefined
            : `${offset ?? 1}${limit === undefined ? "+" : `–${(offset ?? 1) + limit - 1}`}`,
        ],
      ]);
    }
    case "view_image":
      return fields([["Path", string(args, "path")]]);
    case "list":
      return fields([["Path", string(args, "path") ?? "."]]);
    case "glob":
      return fields([
        ["Pattern", string(args, "pattern")],
        ["Directory", string(args, "cwd")],
      ]);
    case "grep":
      return fields([
        ["Pattern", string(args, "pattern")],
        ["Path", string(args, "path")],
        ["Include", string(args, "include")],
      ]);
    case "run_code": {
      const code = string(args, "code");
      return code === undefined ? [] : [{ kind: "code", label: "Code", text: code }];
    }
    case "remember":
      return [
        ...fields([
          ["Scope", string(args, "scope") ?? "project"],
          ["Title", string(args, "title")],
        ]),
        ...prose("Memory", string(args, "content")),
      ];
    case "job_output":
      return fields([["Wait", waitTime(number(args, "waitMs"))]]);
    case "job_kill":
    case "cancel_subagent":
      return [...prose("Reason", string(args, "reason"))];
    case "spawn_subagent":
      return [
        ...fields([["Profile", string(args, "profile")]]),
        ...prose("Task", string(args, "task")),
      ];
    case "wait_subagent":
      return fields([["Wait", waitTime(number(args, "timeoutMs"))]]);
    case "job_list":
      return [];
    case "schedule_wake":
      return [
        ...fields([["When", toolTarget(call)]]),
        ...prose("Message", string(args, "message")),
      ];
    case "update_goal":
      return [
        ...fields([["Status", string(args, "status")]]),
        ...prose("Detail", string(args, "detail")),
      ];
    case "todo_write": {
      const items = todoItems(args);
      return items ? [{ kind: "todos", items }] : [];
    }
    case "mcp_call":
      return [
        { kind: "code", label: "Arguments", text: formatValue(record(args)?.arguments ?? {}) },
      ];
    case "mcp_get_tool":
    case "mcp_list_tools":
      return [];
    default:
      return args === undefined || (record(args) && !Object.keys(args as object).length)
        ? []
        : [{ kind: "code", label: "Arguments", text: formatValue(args) }];
  }
}

/** What the tool produced. Tools whose input already shows the change produce nothing. */
export function outputBlocks(call: ToolCallInput, outcome: ToolOutcome): ToolBlock[] {
  const { result, content, isError, artifact } = outcome;
  const error = string(result, "error");
  if (isError && error) return [{ kind: "error", text: error }];
  if (artifact)
    return [
      {
        kind: "fields",
        rows: [["Stored output", `${formatBytes(artifact.byteLength)} · ${artifact.locator}`]],
      },
    ];
  const text = (label: string, value: string | undefined): ToolBlock[] =>
    value?.trim() ? [{ kind: "code", label, text: value.trimEnd() }] : [];
  switch (call.name) {
    case "shell": {
      const stdout = string(result, "stdout");
      const stderr = string(result, "stderr");
      if (stdout === undefined && stderr === undefined) return text("Output", content);
      const joined =
        stdout && stderr
          ? `${stdout}${stdout.endsWith("\n") ? "" : "\n"}${stderr}`
          : stdout || stderr;
      return isError && !joined?.trim() ? text("Output", content) : text("Output", joined);
    }
    case "read": {
      const fileContent = string(result, "content");
      if (fileContent === undefined) return text("Output", content);
      const fileLines = lines(fileContent);
      return fileLines.length
        ? [
            {
              kind: "lines",
              label: boolean(result, "truncated") ? "Content (truncated)" : "Content",
              start: number(result, "startLine") ?? 1,
              lines: fileLines,
            },
          ]
        : [];
    }
    case "grep": {
      const matches = array(result, "matches");
      if (!matches) return text("Output", content);
      const groups: MatchGroup[] = [];
      for (const match of matches) {
        const path = string(match, "path") ?? "";
        const row = { line: number(match, "line") ?? 0, text: string(match, "text") ?? "" };
        const last = groups.at(-1);
        if (last?.path === path) last.rows.push(row);
        else groups.push({ path, rows: [row] });
      }
      return groups.length
        ? [{ kind: "matches", groups, truncated: boolean(result, "truncated") === true }]
        : [];
    }
    case "list":
    case "glob": {
      const items = array(result, call.name === "list" ? "entries" : "matches");
      if (!items) return text("Output", content);
      const entries = items.map((item) => {
        const directory = string(item, "type") === "directory";
        return {
          name:
            (call.name === "list" ? string(item, "name") : undefined) ?? string(item, "path") ?? "",
          directory,
          size: directory ? undefined : number(item, "size"),
        };
      });
      return entries.length
        ? [{ kind: "files", entries, truncated: boolean(result, "truncated") === true }]
        : [];
    }
    case "job_list": {
      if (!Array.isArray(result)) return text("Output", content);
      const rows = result.map((job): [string, string] => {
        const status = string(job, "status") ?? "unknown";
        const exitCode = number(job, "exitCode");
        return [
          status === "running" || exitCode === undefined ? status : `${status} · exit ${exitCode}`,
          string(job, "label") ?? string(job, "id") ?? "",
        ];
      });
      return rows.length ? [{ kind: "fields", rows }] : [];
    }
    case "job_output": {
      const chunks = array(result, "chunks");
      if (!chunks) return text("Output", content);
      const dropped = number(result, "droppedBytes");
      return [
        ...(dropped
          ? [{ kind: "fields", rows: [["Dropped", formatBytes(dropped)]] } satisfies ToolBlock]
          : []),
        ...text("Output", chunks.map((chunk) => string(chunk, "text") ?? "").join("")),
      ];
    }
    case "job_kill":
    case "spawn_subagent":
    case "cancel_subagent":
      return isError ? text("Output", content) : [];
    case "wait_subagent": {
      const output = string(result, "output");
      if (output === undefined) return text("Output", content);
      const failure = string(result, "error");
      return [
        ...(failure ? [{ kind: "error", text: failure } as const] : []),
        ...(output.trim() ? [{ kind: "markdown", label: "Result", text: output } as const] : []),
      ];
    }
    case "mcp_list_tools": {
      const tools = array(result, "tools");
      if (!tools) return text("Output", content);
      const items = tools.map((tool) => ({
        name: string(tool, "name") ?? "",
        description: string(tool, "description") ?? "",
      }));
      const truncated = number(result, "nextOffset") !== undefined;
      return items.length ? [{ kind: "catalog", items, truncated }] : [];
    }
    case "job_start": {
      const jobId = string(result, "jobId");
      if (!jobId) return text("Output", content);
      return [
        {
          kind: "fields",
          rows: [
            ["Job", jobId],
            ["Status", string(result, "status") ?? "unknown"],
          ],
        },
      ];
    }
    case "write":
    case "edit":
    case "todo_write":
    case "remember":
    case "schedule_wake":
    case "update_goal":
      return isError ? text("Error", content) : [];
    case "run_code": {
      const output = (array(result, "output") ?? [])
        .filter((item) => string(item, "type") === "text")
        .map((item) => string(item, "text"))
        .join("\n");
      const ok = boolean(result, "ok");
      if (ok === undefined) return text("Output", content);
      const value = record(result)?.value;
      return [
        ...text("Output", output),
        ...(ok
          ? text("Return value", value === undefined ? undefined : formatValue(value))
          : [
              {
                kind: "error",
                text: string(record(result)?.error, "message") ?? "Code failed.",
              } as const,
            ]),
      ];
    }
    default:
      return text("Output", content ?? (result === undefined ? undefined : formatValue(result)));
  }
}

const pathTools = new Set(["list", "read", "view_image", "write", "edit"]);

/** Expanded row content: the request, then what came back. Shell output joins its command. */
export function toolDetails(call: ToolCallInput, outcome?: ToolOutcome): ToolBlock[] {
  const target = toolTarget(call, outcome?.result);
  // The row title already shows the target; approval keeps it because its title does not.
  const input = inputBlocks(call).flatMap((block): ToolBlock[] => {
    if (block.kind !== "fields") return [block];
    const rows = block.rows.filter(
      ([label, value]) => value !== target && !(label === "Path" && pathTools.has(call.name)),
    );
    return rows.length ? [{ kind: "fields", rows }] : [];
  });
  if (!outcome) return input;
  const output = outputBlocks(call, outcome);
  const [command, ...rest] = input;
  const [first, ...more] = output;
  if (command?.kind === "terminal" && first?.kind === "code" && first.label === "Output")
    return [{ ...command, output: first.text }, ...rest, ...more];
  return [...input, ...output];
}

export interface HostedToolAction {
  type: string;
  query?: string;
  queries?: string[];
  url?: string;
  pattern?: string;
}

/** Provider-run tools such as OpenAI web search; the server only reports their action. */
export function hostedToolTitle(
  name: string,
  status: "in_progress" | "completed" | "canceled",
  action?: HostedToolAction,
): { label: string; target?: string } {
  if (name !== "web_search") {
    return {
      label:
        status === "canceled"
          ? "Stopped provider tool"
          : status === "in_progress"
            ? "Using provider tool"
            : "Used provider tool",
      target: name,
    };
  }
  if (status === "canceled") return { label: "Stopped web search" };
  if (status === "in_progress") return { label: "Searching the web" };
  switch (action?.type) {
    case "search": {
      const queries = action.queries?.length ? action.queries : action.query ? [action.query] : [];
      return { label: "Searched the web", target: [...new Set(queries)].join(" · ") || undefined };
    }
    case "open_page":
      return { label: "Opened a web page", target: action.url };
    case "find_in_page":
      return {
        label: "Searched within a web page",
        target: [action.pattern, action.url].filter(Boolean).join(" in ") || undefined,
      };
    default:
      return { label: "Used web search" };
  }
}
