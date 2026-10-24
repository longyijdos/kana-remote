import type { UserMessage } from "../api/types";

// User-role messages that the user did not type: wakes, completion notices, goal
// rounds, recovery and compaction. Only the user's own words render as bubbles.

export type NoticeKind = "wake" | "job" | "subagent" | "task" | "goal" | "recovery" | "compaction";

export type UserEntry =
  | { kind: "bubble"; text: string; scheduled: boolean }
  | { kind: "notice"; notice: NoticeKind; label: string; detail?: string };

const hiddenKinds = new Set(["runtime_context", "tool_result_policy", "compaction_request"]);

export function isVisibleUserMessage(message: UserMessage): boolean {
  return !hiddenKinds.has(message.provenance.kind);
}

function stripHeader(content: string, header: string): string {
  return content.startsWith(header) ? content.slice(header.length).replace(/^\n/, "") : content;
}

function exitSuffix(content: string): string {
  const exitCode = /^exitCode: (-?\d+)$/m.exec(content)?.[1];
  return exitCode === undefined ? "" : ` · exit ${exitCode}`;
}

export function describeUserMessage(message: UserMessage): UserEntry {
  const { provenance, content } = message;
  switch (provenance.kind) {
    case "user_input":
      return { kind: "bubble", text: content, scheduled: false };
    case "scheduled_input": {
      const text = stripHeader(content, "[Scheduled wake event]").trim();
      return provenance.origin === "agent"
        ? { kind: "notice", notice: "wake", label: "Kana's wake", detail: text }
        : { kind: "bubble", text, scheduled: true };
    }
    case "job_completion": {
      const status = /^Job \S+ reached (\w+)\./m.exec(content)?.[1];
      return {
        kind: "notice",
        notice: "job",
        label: status
          ? `Background job ${status}${exitSuffix(content)}`
          : "Background job finished",
      };
    }
    case "subagent_completion": {
      const match = /^Subagent \S+ \((.+)\) reached (\w+)\./m.exec(content);
      return {
        kind: "notice",
        notice: "subagent",
        label: match ? `${match[1]} subagent ${match[2]}` : "Subagent finished",
      };
    }
    case "user_task_completion":
      return {
        kind: "notice",
        notice: "task",
        label: "Task update",
        detail: stripHeader(content, "[User task update]").trim(),
      };
    case "goal_continuation":
      return {
        kind: "notice",
        notice: "goal",
        label:
          typeof provenance.round === "number"
            ? `Goal continued · round ${provenance.round}`
            : "Goal continued",
      };
    case "recovery":
      return { kind: "notice", notice: "recovery", label: "Recovered from an interrupted run" };
    case "context_summary":
      return { kind: "notice", notice: "compaction", label: "Context compacted", detail: content };
    default:
      return { kind: "notice", notice: "task", label: provenance.kind, detail: content };
  }
}
