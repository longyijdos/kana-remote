export interface ConnectionSettings {
  address: string;
  token: string;
}

export interface MessageImage {
  mimeType: string;
  data: string;
  width: number;
  height: number;
}

export interface UserMessage {
  id: string;
  role: "user";
  provenance: { kind: string; origin?: string; round?: number };
  content: string;
  images?: MessageImage[];
}

export type AssistantContent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown; rawArgs?: string }
  | {
      type: "hosted_tool";
      id: string;
      name: string;
      status: "in_progress" | "completed" | "canceled";
      action?: { type: string; query?: string; queries?: string[]; url?: string; pattern?: string };
    };

export interface AssistantMessage {
  id: string;
  role: "assistant";
  content: AssistantContent[];
  stopReason?: "stop" | "length" | "toolUse" | "aborted" | "error";
}

export interface ToolResultMessage {
  id: string;
  role: "tool";
  toolCallId: string;
  toolName: string;
  content: string;
  result?: unknown;
  isError: boolean;
  durationMs?: number;
  images?: MessageImage[];
  artifact?: { kind: "text"; locator: string; byteLength: number };
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface ToolState {
  tool_call_id: string;
  name: string;
  status: "running" | "completed";
  arguments?: unknown;
  partial_result?: unknown;
  result?: unknown;
  is_error?: boolean;
  paused?: boolean;
  canceled?: boolean;
}

export interface PendingInput {
  id: string;
  kind: string;
  content: string;
  imageCount?: number;
}

export interface InputQueue {
  pending: PendingInput[];
  scheduled: { id: string; content: string; dueAt: string }[];
}

export type ApprovalDecision = "allow" | "reject" | "always" | "never";

export interface Approval {
  id: string;
  session_id: string | null;
  agent: { id: string; label: string; kind: "main" | "subagent" };
  tool_call: { id: string; name: string; arguments: unknown };
  allow_always: boolean;
}

export interface Snapshot {
  session: {
    id: string;
    messages: Message[];
    timeline: { type: string; id: string; timestamp: string; message_id?: string }[];
  } | null;
  running: boolean;
  run: {
    id: string;
    source: string;
    status: "running" | "completed" | "failed";
    outcome?: string;
    error?: { name: string; message: string };
  } | null;
  assistant: AssistantMessage | null;
  tools: ToolState[];
  context?: { estimated_tokens: number | null; context_limit: number };
  input_queue: InputQueue;
  approvals: Approval[];
}

export interface ServerEvent {
  schema_version: number;
  type: string;
  session_id: string | null;
  run_id: string | null;
  data: unknown;
}

export interface SavedSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
}

export interface SessionsResponse {
  current_session_id: string;
  sessions: SavedSession[];
}

export interface MessageReceipt {
  message_id: string;
  delivery: "submitted" | "steering" | "queued";
}
