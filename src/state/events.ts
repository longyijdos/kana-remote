import type {
  AssistantContent,
  AssistantMessage,
  Message,
  ServerEvent,
  Snapshot,
  ToolState,
  UserMessage,
} from "../api/types";

function upsertMessage(snapshot: Snapshot, message: Message): Snapshot {
  if (!snapshot.session) return snapshot;
  const messages = [...snapshot.session.messages];
  const index = messages.findIndex((item) => item.id === message.id);
  if (index === -1) messages.push(message);
  else messages[index] = message;
  return { ...snapshot, session: { ...snapshot.session, messages } };
}

export function applyEvent(snapshot: Snapshot | null, event: ServerEvent): Snapshot | null {
  if (event.type === "snapshot") return event.data as Snapshot;
  if (event.type === "session.changed") return null;
  if (!snapshot || event.session_id !== snapshot.session?.id) return snapshot;

  switch (event.type) {
    case "run.started": {
      const data = event.data as { source: string; input: UserMessage | null };
      const next = {
        ...snapshot,
        running: true,
        run: { id: event.run_id ?? "", source: data.source, status: "running" as const },
        assistant: null,
        tools: [],
      };
      return data.input ? upsertMessage(next, data.input) : next;
    }
    case "run.completed": {
      const data = event.data as { outcome: string | null };
      return {
        ...snapshot,
        running: false,
        run: snapshot.run
          ? { ...snapshot.run, status: "completed", outcome: data.outcome ?? undefined }
          : null,
      };
    }
    case "run.failed": {
      const data = event.data as { error: { name: string; message: string } };
      return {
        ...snapshot,
        running: false,
        run: snapshot.run ? { ...snapshot.run, status: "failed", error: data.error } : null,
      };
    }
    case "input.queue_changed":
      return { ...snapshot, input_queue: event.data as Snapshot["input_queue"] };
    case "input.committed":
      return upsertMessage(snapshot, (event.data as { message: UserMessage }).message);
    case "assistant.started":
      return { ...snapshot, assistant: (event.data as { message: AssistantMessage }).message };
    case "assistant.completed": {
      const message = (event.data as { message: AssistantMessage }).message;
      return { ...upsertMessage(snapshot, message), assistant: null };
    }
    case "assistant.delta":
    case "assistant.content": {
      const data = event.data as {
        message_id: string;
        content_index: number;
        kind?: string;
        delta?: string;
        content?: AssistantContent;
      };
      if (data.kind === "thinking_delta") return snapshot;
      if (snapshot.assistant?.id !== data.message_id) return snapshot;
      const content = [...snapshot.assistant.content];
      const current = content[data.content_index];
      if (event.type === "assistant.content" && data.content)
        content[data.content_index] = data.content;
      else if (data.kind === "text_delta") {
        content[data.content_index] = {
          type: "text",
          text: (current?.type === "text" ? current.text : "") + data.delta,
        };
      } else if (data.kind === "toolcall_delta" && current?.type === "tool_call") {
        content[data.content_index] = { ...current, rawArgs: (current.rawArgs ?? "") + data.delta };
      }
      return { ...snapshot, assistant: { ...snapshot.assistant, content } };
    }
    case "tool.started":
    case "tool.updated":
    case "tool.completed":
    case "tool.paused":
    case "tool.resumed": {
      const data = event.data as ToolState;
      const tools = [...snapshot.tools];
      const index = tools.findIndex((tool) => tool.tool_call_id === data.tool_call_id);
      const tool = { ...tools[index], ...data };
      if (event.type === "tool.paused") tool.paused = true;
      if (event.type === "tool.resumed" || event.type === "tool.completed") tool.paused = false;
      if (index === -1) tools.push(tool);
      else tools[index] = tool;
      return { ...snapshot, tools };
    }
    case "approval.required": {
      const approval = event.data as Snapshot["approvals"][number];
      return {
        ...snapshot,
        approvals: [...snapshot.approvals.filter((item) => item.id !== approval.id), approval],
      };
    }
    case "approval.resolved":
      return {
        ...snapshot,
        approvals: snapshot.approvals.filter(
          (item) => item.id !== (event.data as { id: string }).id,
        ),
      };
    default:
      return snapshot;
  }
}

export function visibleMessages(snapshot: Snapshot): (UserMessage | AssistantMessage)[] {
  const messages = snapshot.session?.messages ?? [];
  const visible = messages.filter((message): message is UserMessage | AssistantMessage => {
    if (message.role === "user")
      return (
        message.provenance.kind === "user_input" || message.provenance.kind === "scheduled_input"
      );
    return (
      message.role === "assistant" && message.content.some((content) => content.type !== "thinking")
    );
  });
  if (
    snapshot.assistant?.content.some((content) => content.type !== "thinking") &&
    !visible.some((message) => message.id === snapshot.assistant?.id)
  ) {
    visible.push(snapshot.assistant);
  }
  return visible;
}
