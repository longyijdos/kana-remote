import { describe, expect, test } from "bun:test";
import type { AssistantMessage, ServerEvent, Snapshot } from "../src/api/types";
import { applyEvent } from "../src/state/events";
import { StreamingText } from "../src/state/streaming-text";

const empty: Snapshot = {
  session: { id: "session-a", messages: [], timeline: [] },
  running: true,
  run: { id: "run-a", source: "user", status: "running" },
  assistant: null,
  tools: [],
  input_queue: { pending: [], scheduled: [] },
  approvals: [],
};
const assistant: AssistantMessage = { id: "assistant-a", role: "assistant", content: [] };
const text = (message: AssistantMessage | null) =>
  message?.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("") ?? "";

function harness() {
  let snapshot: Snapshot | null = structuredClone(empty);
  let display: AssistantMessage | null = null;
  let time = 0;
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const updates: (AssistantMessage | null)[] = [];
  const stream = new StreamingText({
    onChange(message) {
      display = message;
      updates.push(message);
    },
    requestFrame(callback) {
      frames.set(++id, callback);
      return id;
    },
    cancelFrame(handle) {
      frames.delete(handle);
    },
  });
  const send = (type: string, data: unknown) => {
    const event: ServerEvent = {
      schema_version: 1,
      type,
      session_id: "session-a",
      run_id: "run-a",
      data,
    };
    snapshot = applyEvent(snapshot, event);
    stream.receive(event, snapshot);
  };
  const frame = (elapsed = 16) => {
    time += elapsed;
    const pending = [...frames.entries()];
    for (const [handle, callback] of pending) {
      frames.delete(handle);
      callback(time);
    }
  };
  return {
    stream,
    send,
    frame,
    updates,
    get snapshot() {
      return snapshot;
    },
    get display() {
      return display;
    },
    get pendingFrames() {
      return frames.size;
    },
    delta(delta: string, index = 0) {
      send("assistant.delta", {
        message_id: assistant.id,
        content_index: index,
        kind: "text_delta",
        delta,
      });
    },
    drain() {
      for (let count = 0; frames.size && count < 500; count++) frame();
      expect(frames.size).toBe(0);
    },
  };
}

describe("streaming text presentation", () => {
  test("coalesces SSE bursts while authoritative text is available immediately", () => {
    const h = harness();
    h.send("assistant.started", { message: assistant });
    h.delta("a".repeat(16));
    h.delta("b".repeat(240));
    const full = "a".repeat(16) + "b".repeat(240);
    expect(text(h.snapshot?.assistant ?? null)).toBe(full);
    expect(text(h.display)).toBe("");
    expect(h.pendingFrames).toBe(1);
    h.frame();
    expect(text(h.display).length).toBe(12);
    const firstFrame = text(h.display);
    h.frame(8);
    expect(text(h.display)).toBe(firstFrame);
    h.frame(8);
    expect(text(h.display).length).toBeGreaterThan(firstFrame.length);
    h.drain();
    expect(text(h.display)).toBe(full);
    expect(text(h.snapshot?.assistant ?? null)).toBe(full);
  });

  test("keeps graphemes intact and reveals text and code blocks in content order", () => {
    const h = harness();
    const first = "你好👨‍👩‍👧‍👦e\u0301👍🏽";
    const second = "\n```ts\nconst answer = 42;\n```";
    h.send("assistant.started", { message: assistant });
    h.delta(first);
    h.delta(second, 1);
    h.drain();
    const full = first + second;
    const prefixes = new Set([""]);
    let prefix = "";
    for (const part of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(full)) {
      prefix += part.segment;
      prefixes.add(prefix);
    }
    expect(h.updates.every((update) => prefixes.has(text(update)))).toBe(true);
    expect(text(h.display)).toBe(full);
  });

  test("finishes its visible tail through a normal run completion and snapshot resync", () => {
    const h = harness();
    const full = "Streaming final answer. ".repeat(8);
    h.send("assistant.started", { message: assistant });
    h.delta(full);
    h.frame();
    h.send("assistant.completed", {
      message: { ...assistant, content: [{ type: "text", text: full }], stopReason: "stop" },
    });
    h.send("run.completed", { outcome: "completed" });
    expect(h.snapshot?.running).toBe(false);
    expect(h.snapshot?.assistant).toBeNull();
    expect(text(h.display).length).toBeLessThan(full.length);
    h.send("snapshot", structuredClone(h.snapshot));
    expect(text(h.display).length).toBeLessThan(full.length);
    h.drain();
    expect(h.display).toBeNull();
    expect(h.snapshot?.session?.messages[0]).toMatchObject({ content: [{ text: full }] });
    const count = h.updates.length;
    h.send("snapshot", structuredClone(h.snapshot));
    expect(h.pendingFrames).toBe(0);
    expect(h.updates.slice(count).every((update) => update === null)).toBe(true);
  });

  test.each(["tool_call", "hosted_tool"] as const)(
    "catches up text as soon as %s preparation is visible",
    (type) => {
      const h = harness();
      const full = "Before starting the tool. ".repeat(4);
      h.send("assistant.started", { message: assistant });
      h.delta(full);
      h.send("assistant.content", {
        message_id: assistant.id,
        content_index: 1,
        content:
          type === "tool_call"
            ? { type, id: "tool-a", name: "shell", args: {} }
            : { type, id: "tool-a", name: "search", status: "in_progress" },
      });
      expect(text(h.display)).toBe(full);
      expect(h.pendingFrames).toBe(0);
      expect(h.display?.content[1]?.type).toBe(type);
    },
  );

  test("approval and a manual stop reveal pending text without delaying interaction", () => {
    const h = harness();
    h.send("assistant.started", { message: assistant });
    h.delta("Read this before approving.".repeat(5));
    h.send("approval.required", { id: "approval-a" });
    expect(h.snapshot?.approvals).toHaveLength(1);
    expect(text(h.display)).toBe(text(h.snapshot?.assistant ?? null));
    expect(h.pendingFrames).toBe(0);
    h.delta(" More text before stopping.".repeat(5));
    h.stream.catchUp();
    expect(text(h.display)).toBe(text(h.snapshot?.assistant ?? null));
    expect(h.pendingFrames).toBe(0);
  });

  test("continues smoothing an answer after a hosted search in the same message", () => {
    const h = harness();
    h.send("assistant.started", { message: assistant });
    h.send("assistant.content", {
      message_id: assistant.id,
      content_index: 0,
      content: { type: "hosted_tool", id: "search-a", name: "search", status: "completed" },
    });
    const answer = "Answer based on the search. ".repeat(8);
    h.delta(answer, 1);
    expect(text(h.display)).toBe("");
    expect(h.display?.content[0]).toMatchObject({ type: "hosted_tool", status: "completed" });
    h.frame();
    expect(text(h.display).length).toBeGreaterThan(0);
    expect(text(h.display).length).toBeLessThan(answer.length);
    h.drain();
    expect(text(h.display)).toBe(answer);
  });

  test.each(["aborted", "error", "toolUse"] as const)(
    "immediately settles a response ending with %s",
    (stopReason) => {
      const h = harness();
      const full = "Buffered response. ".repeat(10);
      h.send("assistant.started", { message: assistant });
      h.delta(full);
      h.send("assistant.completed", {
        message: { ...assistant, content: [{ type: "text", text: full }], stopReason },
      });
      expect(h.display).toBeNull();
      expect(h.pendingFrames).toBe(0);
      expect(h.snapshot?.session?.messages[0]).toMatchObject({ content: [{ text: full }] });
    },
  );

  test("shows existing snapshot text immediately and paces only new text after reconnect", () => {
    const h = harness();
    const history = "Already received before reconnect.";
    h.send("snapshot", {
      ...empty,
      assistant: { ...assistant, content: [{ type: "text", text: history }] },
    });
    expect(text(h.display)).toBe(history);
    expect(h.pendingFrames).toBe(0);
    h.delta(" New text.".repeat(10));
    expect(text(h.display)).toBe(history);
    h.frame();
    expect(text(h.display).startsWith(history)).toBe(true);
    h.send("session.changed", { action: "resume" });
    expect(h.display).toBeNull();
    expect(h.pendingFrames).toBe(0);
    h.frame();
    expect(h.display).toBeNull();
  });

  test("uses a corrected final message without duplicating the old prefix", () => {
    const h = harness();
    h.send("assistant.started", { message: assistant });
    h.delta("original text");
    h.stream.catchUp();
    const final = "corrected response";
    h.send("assistant.completed", {
      message: { ...assistant, content: [{ type: "text", text: final }], stopReason: "stop" },
    });
    h.drain();
    expect(h.display).toBeNull();
    expect(h.snapshot?.session?.messages[0]).toMatchObject({ content: [{ text: final }] });
    expect(h.updates.every((update) => !text(update).includes("original textcorrected"))).toBe(
      true,
    );
  });
});
