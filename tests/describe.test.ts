import { describe, expect, test } from "bun:test";
import {
  approvalTitle,
  diffLines,
  hostedToolTitle,
  inputBlocks,
  outputBlocks,
  toolDetails,
  toolLabel,
  toolMeta,
  toolTarget,
} from "../src/tools/describe";

const shell = { name: "shell", args: { command: "git status", cwd: "repo" } };

describe("tool descriptions", () => {
  test("words running and finished calls", () => {
    expect(toolLabel(shell, "running")).toBe("Running");
    expect(toolLabel(shell, "done")).toBe("Ran");
    expect(toolLabel(shell, "failed")).toBe("Ran");
    expect(toolLabel({ name: "write", args: { overwrite: true } }, "done")).toBe("Overwrote");
    expect(toolLabel({ name: "update_goal", args: { status: "completed" } }, "done")).toBe(
      "Completed goal",
    );
  });

  test("shows shell commands and their streams in one terminal block", () => {
    expect(toolTarget(shell)).toBe("git status");
    expect(inputBlocks(shell)).toEqual([
      { kind: "terminal", command: "git status" },
      { kind: "fields", rows: [["Directory", "repo"]] },
    ]);
    const outcome = {
      content: "exitCode: 1\nstdout: ...",
      result: { exitCode: 1, timedOut: false, stdout: "out\n", stderr: "err\n" },
    };
    expect(toolMeta(shell, outcome)).toBe("exit 1");
    expect(toolDetails(shell, outcome)).toEqual([
      { kind: "terminal", command: "git status", output: "out\nerr" },
      { kind: "fields", rows: [["Directory", "repo"]] },
    ]);
  });

  test("diffs edits line by line and keeps unchanged lines as context", () => {
    expect(diffLines("a\nb\nc\n", "a\nB\nc\n")).toEqual([
      { type: "context", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "B" },
      { type: "context", text: "c" },
    ]);
    expect(diffLines("", "new\n")).toEqual([{ type: "added", text: "new" }]);
    const edit = {
      name: "edit",
      args: { path: "src/a.ts", edits: [{ oldText: "a\nb\n", newText: "a\nc\n" }] },
    };
    expect(toolTarget(edit, { path: "/abs/src/a.ts" })).toBe("/abs/src/a.ts");
    expect(toolMeta(edit, {})).toBe("+1 −1");
    expect(outputBlocks(edit, { content: "ok", result: { path: "src/a.ts" } })).toEqual([]);
    expect(inputBlocks(edit)[0]).toEqual({ kind: "fields", rows: [["Path", "src/a.ts"]] });
    expect(toolDetails(edit, { result: { path: "/abs/src/a.ts" } })[0]?.kind).toBe("diff");
  });

  test("structures search, listing and read results instead of model-facing text", () => {
    const content = "path: .\nmatches: 2\n\nnotes.md:2:1:two";
    expect(
      outputBlocks(
        { name: "grep", args: { pattern: "t" } },
        {
          content,
          result: {
            matches: [
              { path: "notes.md", line: 2, text: "two" },
              { path: "notes.md", line: 3, text: "three" },
              { path: "b.md", line: 1, text: "ten" },
            ],
            truncated: true,
          },
        },
      ),
    ).toEqual([
      {
        kind: "matches",
        groups: [
          {
            path: "notes.md",
            rows: [
              { line: 2, text: "two" },
              { line: 3, text: "three" },
            ],
          },
          { path: "b.md", rows: [{ line: 1, text: "ten" }] },
        ],
        truncated: true,
      },
    ]);
    expect(
      outputBlocks(
        { name: "list", args: {} },
        {
          content,
          result: {
            entries: [
              { name: "src", type: "directory", size: 0 },
              { name: "a.ts", type: "file", size: 12 },
            ],
          },
        },
      ),
    ).toEqual([
      {
        kind: "files",
        entries: [
          { name: "src", directory: true, size: undefined },
          { name: "a.ts", directory: false, size: 12 },
        ],
        truncated: false,
      },
    ]);
    expect(
      outputBlocks(
        { name: "read", args: {} },
        { content, result: { content: "one\ntwo\n", startLine: 5, truncated: false } },
      ),
    ).toEqual([{ kind: "lines", label: "Content", start: 5, lines: ["one", "two"] }]);
  });

  test("shows the todo list from arguments and errors from results", () => {
    const items = [
      { content: "Plan", status: "completed" },
      { content: "Build", status: "in_progress" },
    ];
    const todo = { name: "todo_write", args: { items } };
    expect(toolTarget(todo)).toBe("1 active · 0 pending · 1 completed · Build");
    expect(
      toolDetails(todo, { content: "Todo list updated.", result: { status: "updated" } }),
    ).toEqual([{ kind: "todos", items }]);
    expect(toolLabel({ name: "todo_write", args: { items: [] } }, "done")).toBe("Cleared todos");
    expect(
      outputBlocks(
        { name: "read", args: {} },
        { isError: true, result: { error: "No such file" } },
      ),
    ).toEqual([{ kind: "error", text: "No such file" }]);
  });

  test("falls back to name, best-effort target and raw content for unknown tools", () => {
    const custom = { name: "fetch_weather", args: { query: "Tokyo" } };
    expect(toolLabel(custom, "done")).toBe("Used fetch_weather");
    expect(toolTarget(custom)).toBe("Tokyo");
    expect(inputBlocks(custom)).toEqual([
      { kind: "code", label: "Arguments", text: '{\n  "query": "Tokyo"\n}' },
    ]);
    expect(outputBlocks(custom, { content: "Sunny" })).toEqual([
      { kind: "code", label: "Output", text: "Sunny" },
    ]);
  });

  test("summarizes jobs, images and wakes from their structured results", () => {
    const job = { name: "job_start", args: { command: "bun dev" } };
    expect(
      toolDetails(job, { content: "Started.", result: { jobId: "j1", status: "running" } }),
    ).toEqual([
      { kind: "terminal", command: "bun dev" },
      {
        kind: "fields",
        rows: [
          ["Job", "j1"],
          ["Status", "running"],
        ],
      },
    ]);
    expect(
      toolMeta(
        { name: "view_image", args: {} },
        { result: { mimeType: "image/png", width: 800, height: 600, byteSize: 2_048 } },
      ),
    ).toBe("PNG · 800×600 · 2 KB");
    const soon = new Date(Date.now() + 60_000).toISOString();
    expect(toolMeta({ name: "schedule_wake", args: {} }, { result: { dueAt: soon } })).toStartWith(
      new Date(soon).toDateString() === new Date().toDateString() ? "at " : "",
    );
  });

  test("describes subagents and background jobs from their structured results", () => {
    const spawn = { name: "spawn_subagent", args: { profile: "researcher", task: " Find X. " } };
    expect([toolLabel(spawn, "done"), toolTarget(spawn)]).toEqual([
      "Started subagent",
      "researcher",
    ]);
    expect(toolDetails(spawn, { result: { agentId: "a1", status: "running" } })).toEqual([
      { kind: "text", label: "Task", text: "Find X." },
    ]);
    const wait = { name: "wait_subagent", args: { agentId: "a1" } };
    const finished = { result: { status: "completed", output: "**Done**", waitTimedOut: false } };
    expect(toolMeta(wait, finished)).toBe("completed");
    expect(toolDetails(wait, finished)).toEqual([
      { kind: "markdown", label: "Result", text: "**Done**" },
    ]);
    expect(toolMeta(wait, { result: { status: "running", output: "", waitTimedOut: true } })).toBe(
      "still running",
    );
    const jobs = [
      { id: "j1", label: "bun dev", status: "running", exitCode: null },
      { id: "j2", label: "bun test", status: "completed", exitCode: 0 },
    ];
    expect(toolMeta({ name: "job_list", args: {} }, { result: jobs })).toBe("2 jobs");
    expect(outputBlocks({ name: "job_list", args: {} }, { result: jobs })).toEqual([
      {
        kind: "fields",
        rows: [
          ["running", "bun dev"],
          ["completed · exit 0", "bun test"],
        ],
      },
    ]);
    const output = {
      result: {
        status: "completed",
        exitCode: 0,
        droppedBytes: 0,
        chunks: [
          { stream: "stdout", text: "a\n" },
          { stream: "stderr", text: "b\n" },
        ],
      },
    };
    const read = { name: "job_output", args: { jobId: "j2" } };
    expect([toolTarget(read), toolMeta(read, output)]).toEqual(["j2", "completed · exit 0"]);
    expect(outputBlocks(read, output)).toEqual([{ kind: "code", label: "Output", text: "a\nb" }]);
  });

  test("lists MCP tools as a catalog and notes further pages", () => {
    const call = { name: "mcp_list_tools", args: { name: "github" } };
    const tools = [
      { name: "search_issues", description: "Search issues and pull requests." },
      { name: "get_me", description: "" },
    ];
    expect(outputBlocks(call, { result: { tools, nextOffset: 20 } })).toEqual([
      { kind: "catalog", items: tools, truncated: true },
    ]);
    expect(outputBlocks(call, { result: { tools: [] } })).toEqual([]);
  });

  test("titles approvals with the requester and action", () => {
    expect(approvalTitle(shell, "Kana")).toBe("Allow Kana to run a shell command?");
    expect(approvalTitle({ name: "fetch_weather", args: {} }, "researcher")).toBe(
      "Allow researcher to use fetch_weather?",
    );
  });

  test("describes provider web search actions", () => {
    expect(hostedToolTitle("web_search", "in_progress")).toEqual({ label: "Searching the web" });
    expect(
      hostedToolTitle("web_search", "completed", { type: "search", queries: ["kana", "kana"] }),
    ).toEqual({ label: "Searched the web", target: "kana" });
  });
});
