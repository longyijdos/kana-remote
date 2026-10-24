import { describe, expect, test } from "bun:test";
import type { UserMessage } from "../src/api/types";
import { describeUserMessage } from "../src/state/notices";

function message(content: string, provenance: UserMessage["provenance"]): UserMessage {
  return { id: "m1", role: "user", content, provenance };
}

describe("user message entries", () => {
  test("renders only the user's own words as bubbles", () => {
    expect(describeUserMessage(message("hi", { kind: "user_input" }))).toEqual({
      kind: "bubble",
      text: "hi",
      scheduled: false,
    });
    expect(
      describeUserMessage(
        message("[Scheduled wake event]\nStand up", { kind: "scheduled_input", origin: "user" }),
      ),
    ).toEqual({ kind: "bubble", text: "Stand up", scheduled: true });
  });

  test("shows Kana's own wakes as notices with their note", () => {
    expect(
      describeUserMessage(
        message("[Scheduled wake event]\nCheck the deploy", {
          kind: "scheduled_input",
          origin: "agent",
        }),
      ),
    ).toEqual({ kind: "notice", notice: "wake", label: "Kana's wake", detail: "Check the deploy" });
  });

  test("summarizes completions without the model-facing instructions", () => {
    expect(
      describeUserMessage(
        message(
          "[Background Job completion]\nJob j1 reached completed.\nexitCode: 0\nUse job_output to consume any remaining output.",
          { kind: "job_completion" },
        ),
      ),
    ).toEqual({ kind: "notice", notice: "job", label: "Background job completed · exit 0" });
    expect(
      describeUserMessage(
        message(
          "[Subagent completion]\nSubagent a1 (researcher) reached errored.\nUse wait_subagent to consume its final result.",
          { kind: "subagent_completion" },
        ),
      ),
    ).toEqual({ kind: "notice", notice: "subagent", label: "researcher subagent errored" });
    expect(
      describeUserMessage(
        message("[Goal continuation]\nContinue.", { kind: "goal_continuation", round: 3 }),
      ),
    ).toEqual({ kind: "notice", notice: "goal", label: "Goal continued · round 3" });
  });
});
