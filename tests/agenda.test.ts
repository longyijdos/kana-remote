import { describe, expect, test } from "bun:test";
import type { Snapshot } from "../src/api/types";
import { agendaSummary, formatCountdown, formatDue } from "../src/state/agenda";

function snapshot(extra: Partial<Snapshot> = {}): Snapshot {
  return {
    session: { id: "s", messages: [], timeline: [] },
    running: false,
    run: null,
    assistant: null,
    tools: [],
    input_queue: { pending: [], scheduled: [] },
    approvals: [],
    ...extra,
  };
}

const wake = (id: string, dueAt: string) => ({
  id,
  sessionId: "s",
  dueAt,
  message: "check in",
  origin: "user" as const,
});

const goal = {
  id: "g",
  objective: "Ship",
  status: "active" as const,
  admittedRounds: 1,
  maxRounds: 8,
  startedAt: "2026-10-25T01:00:00.000Z",
};

describe("agenda", () => {
  test("summarizes only what still needs attention", () => {
    expect(agendaSummary(snapshot())).toBeNull();
    expect(
      agendaSummary(
        snapshot({
          goal: { ...goal, status: "completed" },
          todo: [{ content: "a", status: "completed" }],
        }),
      ),
    ).toBeNull();
    const first = wake("w1", "2026-10-25T02:00:00.000Z");
    expect(
      agendaSummary(
        snapshot({
          goal,
          todo: [
            { content: "a", status: "completed" },
            { content: "b", status: "in_progress" },
          ],
          input_queue: {
            pending: [],
            scheduled: [first, wake("w2", "2026-10-25T03:00:00.000Z")],
          },
        }),
      ),
    ).toEqual({ goal, todos: { done: 1, total: 2 }, next: first, scheduled: 2 });
  });

  test("formats due times in local wall time with a countdown", () => {
    const now = new Date(2026, 9, 25, 13, 50);
    expect(formatDue(new Date(2026, 9, 25, 14, 5).toISOString(), now)).toBe("14:05");
    expect(formatDue(new Date(2026, 9, 26, 9, 0).toISOString(), now)).toBe("Tomorrow 09:00");
    expect(formatDue(new Date(2026, 9, 28, 9, 0).toISOString(), now)).toBe("Oct 28 09:00");
    expect(formatCountdown(new Date(2026, 9, 25, 14, 5).toISOString(), now)).toBe("in 15 min");
    expect(formatCountdown(new Date(2026, 9, 25, 16, 0).toISOString(), now)).toBe("in 2 h 10 min");
    expect(formatCountdown(new Date(2026, 9, 25, 13, 0).toISOString(), now)).toBe("due now");
  });
});
