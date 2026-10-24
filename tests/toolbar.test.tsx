import { describe, expect, test } from "bun:test";
import type { Snapshot } from "../src/api/types";
import { contextRemaining, presence } from "../src/components/Toolbar";

const idle: Snapshot = {
  session: { id: "s1", messages: [], timeline: [] },
  running: false,
  run: null,
  assistant: null,
  tools: [],
  context: { estimated_tokens: 10_000, context_limit: 100_000 },
  input_queue: { pending: [], scheduled: [] },
  approvals: [],
};

function describeState(
  snapshot: Snapshot,
  status: Parameters<typeof presence>[0]["status"] = "connected",
) {
  return presence({ status, snapshot, activity: null, sending: false });
}

describe("context remaining", () => {
  test.each([
    [0, 100],
    [28_000, 72],
    [28_600, 71],
    [125_000, 0],
  ])("reports %i used tokens as %i percent remaining", (tokens, remaining) => {
    expect(contextRemaining({ estimated_tokens: tokens, context_limit: 100_000 })).toBe(remaining);
  });

  test("is unknown when estimates are absent or unavailable", () => {
    for (const context of [
      undefined,
      { estimated_tokens: null, context_limit: 100_000 },
      { estimated_tokens: 100, context_limit: 0 },
    ]) {
      expect(contextRemaining(context)).toBeNull();
    }
  });
});

describe("presence", () => {
  test("describes connection problems before agent state", () => {
    expect(describeState(idle, "reconnecting")).toEqual({
      label: "Reconnecting…",
      tone: "pending",
    });
    expect(describeState(idle, "unauthorized")).toEqual({ label: "Unauthorized", tone: "offline" });
    expect(describeState(idle, "error")).toEqual({ label: "Offline", tone: "offline" });
  });

  test("is online when idle and warns when context runs low", () => {
    expect(describeState(idle)).toEqual({ label: "Online", tone: "idle" });
    expect(
      describeState({ ...idle, context: { estimated_tokens: 85_000, context_limit: 100_000 } }),
    ).toEqual({ label: "Online · 15% context left", tone: "attention" });
  });

  test("names the running tool and prioritizes pending approvals", () => {
    const running: Snapshot = {
      ...idle,
      running: true,
      tools: [{ tool_call_id: "t1", name: "shell", status: "running" }],
    };
    expect(describeState(running)).toEqual({ label: "Running shell…", tone: "active" });
    expect(
      describeState({
        ...running,
        approvals: [
          {
            id: "a1",
            session_id: "s1",
            agent: { id: "main", label: "main", kind: "main" },
            tool_call: { id: "t1", name: "shell", arguments: {} },
            allow_always: true,
          },
        ],
      }),
    ).toEqual({ label: "Waiting for approval", tone: "attention" });
  });
});
