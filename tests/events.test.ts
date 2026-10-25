import { describe, expect, test } from "bun:test";
import type { AssistantMessage, ServerEvent, Snapshot, UserMessage } from "../src/api/types";
import {
  applyEvent,
  projectActivity,
  type TranscriptActivity,
  visibleMessages,
} from "../src/state/events";

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
  test("tracks context from snapshots and SSE without changing transcript activity", () => {
    const initial = {
      ...snapshot(),
      running: true,
      assistant,
      context: { estimated_tokens: 64_000, context_limit: 128_000 },
    };
    let state = applyEvent(null, event("snapshot", initial));
    expect(state?.context).toEqual(initial.context);
    const update = event("context.updated", { estimated_tokens: 8_000, context_limit: 64_000 });
    state = applyEvent(state, update);
    expect(state?.context).toEqual({ estimated_tokens: 8_000, context_limit: 64_000 });
    expect(state?.assistant).toBe(assistant);
    expect(state?.session).toBe(initial.session);
    expect(initial.context.estimated_tokens).toBe(64_000);
    expect(projectActivity("compacting", update, state)).toBe("compacting");
    state = applyEvent(
      state,
      event("context.updated", { estimated_tokens: null, context_limit: 64_000 }),
    );
    expect(state?.context?.estimated_tokens).toBeNull();
    state = applyEvent(state, event("snapshot", snapshot()));
    expect(state?.context).toBeUndefined();
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
  test("shows automatic inputs but not thinking or injected runtime context", () => {
    const notice = { ...user, id: "job", provenance: { kind: "job_completion" } };
    const state = {
      ...snapshot(),
      session: {
        ...snapshot().session,
        messages: [
          user,
          notice,
          { ...user, id: "hidden", provenance: { kind: "runtime_context" } },
          {
            ...assistant,
            id: "thought",
            content: [{ type: "thinking" as const, text: "private thinking" }],
          },
        ],
      },
    };
    expect(visibleMessages(state)).toEqual([user, notice]);
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
  test("follows todo and goal changes", () => {
    const items = [{ content: "Draft", status: "in_progress" }];
    let state = applyEvent(snapshot(), event("todo.changed", { toolCallId: "t1", items }));
    expect(state?.todo).toEqual(items);
    const goal = {
      id: "g1",
      objective: "Ship it",
      status: "active",
      admittedRounds: 1,
      maxRounds: 8,
      startedAt: "2026-10-25T01:00:00.000Z",
    };
    state = applyEvent(state, event("goal.changed", { change: "started", goal }));
    expect(state?.goal).toEqual(goal);
    state = applyEvent(state, event("goal.changed", { change: "discarded", goal }));
    expect(state?.goal).toBeNull();
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

describe("transcript activity", () => {
  const toolMessage: AssistantMessage = {
    id: "tool-message",
    role: "assistant",
    stopReason: "toolUse",
    content: [{ type: "tool_call", id: "call-a", name: "shell", args: { command: "pwd" } }],
  };
  const approval = {
    id: "approval-a",
    session_id: "session-a",
    allow_always: true,
    agent: { id: "main", label: "Main", kind: "main" as const },
    tool_call: { id: "call-a", name: "shell", arguments: { command: "pwd" } },
  };
  function running(): Snapshot {
    return {
      ...snapshot(),
      running: true,
      run: { id: "run-a", source: "user", status: "running" },
    };
  }

  test("shows Working before output regardless of provider reasoning support", () => {
    let state = applyEvent(snapshot(), event("run.started", { source: "user", input: user }));
    expect(projectActivity(null, event("run.started", {}), state)).toBe("working");
    state = applyEvent(
      state,
      event("assistant.started", { message: { ...assistant, content: [] } }),
    );
    expect(projectActivity("working", event("assistant.started", {}), state)).toBe("working");
    state = applyEvent(
      state,
      event("assistant.delta", {
        message_id: assistant.id,
        kind: "text_delta",
        content_index: 0,
        delta: "Hello",
      }),
    );
    expect(projectActivity("working", event("assistant.delta", {}), state)).toBeNull();
  });

  test("preparation freezes through approval and becomes a tool block at execution", () => {
    let state: Snapshot | null = running();
    let activity: TranscriptActivity | null = "working";
    function receive(type: string, data: unknown) {
      const update = event(type, data);
      state = applyEvent(state, update);
      activity = projectActivity(activity, update, state);
    }
    receive("assistant.started", { message: { ...toolMessage, content: [] } });
    receive("assistant.content", {
      message_id: toolMessage.id,
      content_index: 0,
      content: toolMessage.content[0],
    });
    expect(activity).toBe("preparing");
    expect(visibleMessages(state ?? snapshot())).toEqual([]);
    receive("assistant.completed", { message: toolMessage });
    receive("approval.required", approval);
    expect(activity).toBe("prepared");
    receive("approval.resolved", { id: approval.id, decision: "allow" });
    expect(activity).toBe("prepared");
    receive("tool.started", {
      tool_call_id: "call-a",
      name: "shell",
      status: "running",
      arguments: { command: "pwd" },
    });
    expect(activity).toBeNull();
    expect(visibleMessages(state ?? snapshot())).toEqual([toolMessage]);
    receive("tool.completed", {
      tool_call_id: "call-a",
      name: "shell",
      status: "completed",
      result: { content: "/tmp" },
      is_error: false,
    });
    receive("model_turn.started", { turn: 2 });
    expect(activity).toBe("working");
  });

  test("restores preparation and prepared status from reconnect snapshots", () => {
    const preparing = { ...running(), assistant: toolMessage };
    expect(projectActivity(null, event("snapshot", preparing), preparing)).toBe("preparing");
    const prepared = {
      ...running(),
      session: { ...snapshot().session, messages: [toolMessage] },
      approvals: [approval],
    };
    expect(projectActivity(null, event("snapshot", prepared), prepared)).toBe("prepared");
    const executing: Snapshot = {
      ...prepared,
      approvals: [],
      tools: [{ tool_call_id: "call-a", name: "shell", status: "running" }],
    };
    expect(projectActivity("prepared", event("snapshot", executing), executing)).toBeNull();
  });

  test("does not mistake old completed calls for a new preparation phase", () => {
    const state: Snapshot = {
      ...running(),
      session: {
        ...snapshot().session,
        messages: [
          toolMessage,
          {
            id: "result-a",
            role: "tool",
            toolCallId: "call-a",
            toolName: "shell",
            content: "/tmp",
            isError: false,
          },
        ],
      },
    };
    expect(projectActivity(null, event("snapshot", state), state)).toBe("working");
    expect(visibleMessages(state)).toEqual([toolMessage]);
  });

  test("stopping cancels an unfinished tool and clears transient activity", () => {
    const state: Snapshot = {
      ...running(),
      tools: [{ tool_call_id: "call-a", name: "shell", status: "running" }],
    };
    const update = event("run.completed", { outcome: "aborted" });
    const stopped = applyEvent(state, update);
    expect(stopped?.tools[0]).toMatchObject({ cancelled: true, paused: false });
    expect(projectActivity("preparing", update, stopped)).toBeNull();
    const failed = event("assistant.completed", {
      message: { ...toolMessage, stopReason: "error" },
    });
    expect(projectActivity("preparing", failed, applyEvent(running(), failed))).toBeNull();
  });

  test("nested approvals pause the existing tool without adding a preparation phase", () => {
    let state: Snapshot | null = {
      ...running(),
      tools: [{ tool_call_id: "parent", name: "run_code", status: "running" }],
    };
    const pause = event("tool.paused", {
      tool_call_id: "parent",
      name: "run_code",
      reason: "approval",
    });
    state = applyEvent(state, pause);
    const required = event("approval.required", {
      ...approval,
      tool_call: { ...approval.tool_call, id: "child" },
    });
    state = applyEvent(state, required);
    expect(projectActivity(null, required, state)).toBeNull();
    expect(state?.tools[0]?.paused).toBe(true);
  });

  test("compaction replaces the current activity and resumes Working afterwards", () => {
    const state = running();
    expect(projectActivity("working", event("context.compaction_started", {}), state)).toBe(
      "compacting",
    );
    expect(projectActivity("compacting", event("context.compacted", {}), state)).toBe("working");
  });
});
