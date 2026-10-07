import { describe, expect, test } from "bun:test";
import type { AssistantMessage, ServerEvent, Snapshot, UserMessage } from "../src/api/types";
import { applyEvent, visibleMessages } from "../src/state/events";

const user: UserMessage = {
  id: "user-1",
  role: "user",
  provenance: { kind: "user_input" },
  content: "继续工作",
};
const assistant: AssistantMessage = {
  id: "assistant-1",
  role: "assistant",
  content: [{ type: "text", text: "第一段" }],
};
function snapshot(): Snapshot & { session: NonNullable<Snapshot["session"]> } {
  return {
    session: { id: "session-a", messages: [], timeline: [] },
    running: false,
    run: null,
    assistant: null,
    tools: [],
    input_queue: { pending: [], scheduled: [] },
    approvals: [],
  };
}
function event(type: string, data: unknown, sessionId = "session-a"): ServerEvent {
  return { schema_version: 1, type, data, session_id: sessionId, run_id: "run-a" };
}

describe("server event projection", () => {
  test("continues partial text after a reconnect without duplicating content", () => {
    let state = applyEvent(null, event("snapshot", { ...snapshot(), assistant }));
    state = applyEvent(
      state,
      event("assistant.delta", {
        message_id: assistant.id,
        content_index: 0,
        kind: "text_delta",
        delta: "第二段",
      }),
    );
    expect(state?.assistant?.content).toEqual([{ type: "text", text: "第一段第二段" }]);
    state = applyEvent(
      state,
      event("assistant.content", {
        message_id: assistant.id,
        content_index: 0,
        content: { type: "text", text: "第一段第二段" },
      }),
    );
    state = applyEvent(
      state,
      event("assistant.completed", {
        message: { ...assistant, content: [{ type: "text", text: "第一段第二段" }] },
      }),
    );
    expect(visibleMessages(state ?? snapshot())).toHaveLength(1);
    expect(state?.assistant).toBeNull();
    expect(state?.session?.messages[0]).toMatchObject({ content: [{ text: "第一段第二段" }] });
  });
  test("a snapshot replaces history, tools, queues and approvals authoritatively", () => {
    const previous = {
      ...snapshot(),
      session: { ...snapshot().session, messages: [user] },
      tools: [{ tool_call_id: "old", name: "shell", status: "running" as const }],
      approvals: [{ id: "stale" }],
    } as Snapshot;
    const authoritative = snapshot();
    expect(applyEvent(previous, event("snapshot", authoritative))).toBe(authoritative);
  });
  test("a submitted user message is displayed once when also committed", () => {
    let state = applyEvent(snapshot(), event("run.started", { source: "user", input: user }));
    state = applyEvent(state, event("input.committed", { message: user }));
    expect(state?.running).toBe(true);
    expect(state?.session?.messages).toEqual([user]);
  });
  test("ignores an event for another session and waits for a fresh snapshot after a switch", () => {
    const state = snapshot();
    expect(applyEvent(state, event("input.committed", { message: user }, "old-session"))).toBe(
      state,
    );
    expect(
      applyEvent(state, event("session.changed", { action: "resume" }, "new-session")),
    ).toBeNull();
    expect(applyEvent(null, event("input.committed", { message: user }))).toBeNull();
  });
  test("a repeated assistant completion replaces the same message", () => {
    const state = applyEvent(snapshot(), event("assistant.completed", { message: assistant }));
    expect(
      applyEvent(state, event("assistant.completed", { message: assistant }))?.session?.messages,
    ).toEqual([assistant]);
  });
  test("preserves tool arguments when completion only contains the result", () => {
    let state = applyEvent(
      snapshot(),
      event("tool.started", {
        tool_call_id: "call-a",
        name: "shell",
        status: "running",
        arguments: { command: "pwd" },
      }),
    );
    state = applyEvent(
      state,
      event("tool.paused", { tool_call_id: "call-a", name: "shell", reason: "approval" }),
    );
    expect(state?.tools[0]?.paused).toBe(true);
    state = applyEvent(
      state,
      event("tool.completed", {
        tool_call_id: "call-a",
        name: "shell",
        status: "completed",
        result: { output: "/tmp" },
        is_error: false,
      }),
    );
    expect(state?.tools[0]).toMatchObject({
      arguments: { command: "pwd" },
      status: "completed",
      result: { output: "/tmp" },
      paused: false,
    });
  });
  test("removes resolved approvals and replaces duplicates by ID", () => {
    const approval = {
      id: "approval-a",
      session_id: "session-a",
      tool_call: { id: "call-a", name: "shell", arguments: {} },
      agent: { id: "main", label: "Main", kind: "main" },
      allow_always: true,
    };
    let state = applyEvent(snapshot(), event("approval.required", approval));
    state = applyEvent(state, event("approval.required", approval));
    expect(state?.approvals).toHaveLength(1);
    state = applyEvent(state, event("approval.resolved", { id: approval.id, decision: "allow" }));
    expect(state?.approvals).toEqual([]);
  });
  test("does not expose thinking or injected runtime context as chat", () => {
    const state = {
      ...snapshot(),
      session: {
        ...snapshot().session,
        messages: [
          user,
          { ...user, id: "hidden", provenance: { kind: "runtime_context" } },
          {
            ...assistant,
            id: "thought",
            content: [{ type: "thinking" as const, text: "private thinking" }],
          },
        ],
      },
    };
    expect(visibleMessages(state)).toEqual([user]);
    const thinking = {
      ...state,
      assistant: { ...assistant, content: [{ type: "thinking" as const, text: "" }] },
    };
    expect(
      applyEvent(
        thinking,
        event("assistant.delta", {
          message_id: assistant.id,
          kind: "thinking_delta",
          content_index: 0,
          delta: "hidden",
        }),
      ),
    ).toBe(thinking);
  });
  test("stopping a run keeps its queued inputs", () => {
    let state = applyEvent(snapshot(), event("run.started", { source: "user", input: user }));
    state = applyEvent(
      state,
      event("input.queue_changed", {
        pending: [{ id: "queued-a", kind: "queued", content: "下一项" }],
        scheduled: [],
      }),
    );
    state = applyEvent(state, event("run.completed", { outcome: "aborted" }));
    expect(state?.running).toBe(false);
    expect(state?.run?.outcome).toBe("aborted");
    expect(state?.input_queue.pending).toHaveLength(1);
  });
});
