import { fetchEventSource } from "@microsoft/fetch-event-source";
import type {
  ApprovalDecision,
  ConnectionSettings,
  MessageReceipt,
  ServerEvent,
  SessionsResponse,
  Snapshot,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function normalizeSettings(settings: ConnectionSettings): ConnectionSettings {
  const url = new URL(settings.address.trim());
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Enter an HTTP or HTTPS server URL.");
  }
  if (url.search || url.hash) throw new Error("The server URL cannot contain a query or fragment.");
  const token = settings.token.trim();
  if (!token) throw new Error("Enter an access token.");
  return { address: url.toString().replace(/\/+$/, ""), token };
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Authentication failed. Check your token.";
    if (error.code === "session_mismatch")
      return "Session changed. Syncing; review your message before retrying.";
    if (error.code === "busy")
      return "Wait for the current run to finish before switching sessions.";
    if (error.code === "not_found")
      return "This session or approval no longer exists. Sync and try again.";
    if (error.status === 503) return "The server is shutting down. Reconnect later.";
    return error.message;
  }
  if (error instanceof TypeError)
    return "Connection failed. Check the URL, network and proxy CORS settings.";
  if (error instanceof Error) {
    if (error.name === "TimeoutError")
      return "Request timed out. Delivery is unconfirmed; sync before retrying.";
    return error.message;
  }
  return "Request failed. Try again later.";
}

export class KanaApi {
  readonly settings: ConnectionSettings;

  constructor(settings: ConnectionSettings) {
    this.settings = settings;
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.settings.address}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${this.settings.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    return readResponse<T>(response);
  }

  state(): Promise<Snapshot> {
    return this.request("/v1/state");
  }

  sessions(): Promise<SessionsResponse> {
    return this.request("/v1/sessions");
  }

  newSession(): Promise<{ session_id: string }> {
    return this.request("/v1/sessions", {});
  }

  resumeSession(id: string): Promise<{ session_id: string }> {
    return this.request(`/v1/sessions/${encodeURIComponent(id)}/resume`, {});
  }

  send(sessionId: string, message: string): Promise<MessageReceipt> {
    return this.request("/v1/messages", { session_id: sessionId, message });
  }

  abort(sessionId: string): Promise<{ stopping: true }> {
    return this.request("/v1/abort", { session_id: sessionId });
  }

  decide(sessionId: string, id: string, decision: ApprovalDecision): Promise<{ resolved: true }> {
    return this.request(`/v1/approvals/${encodeURIComponent(id)}`, {
      session_id: sessionId,
      decision,
    });
  }

  events(
    signal: AbortSignal,
    callbacks: { onEvent: (event: ServerEvent) => void; onRetry: (error: unknown) => void },
  ): Promise<void> {
    return fetchEventSource(`${this.settings.address}/v1/events`, {
      headers: { Authorization: `Bearer ${this.settings.token}` },
      signal,
      cache: "no-store",
      openWhenHidden: true,
      async onopen(response) {
        if (!response.ok) await readResponse(response);
        if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
          throw new ApiError(
            0,
            "invalid_stream",
            "Expected an event stream. Check the proxy route.",
          );
        }
      },
      onmessage(message) {
        if (!message.data) return;
        const event = JSON.parse(message.data) as ServerEvent;
        if (event.schema_version !== 1) {
          throw new ApiError(0, "unsupported_schema", "Unsupported server protocol version.");
        }
        callbacks.onEvent(event);
      },
      onclose() {
        throw new Error("Event stream disconnected. Reconnecting.");
      },
      onerror(error) {
        if (error instanceof ApiError && (error.status === 401 || error.status < 500)) throw error;
        if (error instanceof SyntaxError)
          throw new Error("Invalid event data. Check the server version.");
        callbacks.onRetry(error);
        return 2_000;
      },
    });
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? "request_failed",
      body?.error?.message ?? `Request failed (${response.status}). Check the proxy route.`,
    );
  }
  if (!body) throw new ApiError(0, "invalid_response", "Expected JSON. Check the proxy route.");
  if (body.schema_version !== 1)
    throw new ApiError(0, "unsupported_schema", "Unsupported server protocol version.");
  return body.data as T;
}
