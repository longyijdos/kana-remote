import { fetchEventSource } from "@microsoft/fetch-event-source";
import type {
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
    throw new Error("请输入 HTTP 或 HTTPS 的 server 地址。");
  }
  if (url.search || url.hash) throw new Error("server 地址不能包含查询参数或片段。");
  const token = settings.token.trim();
  if (!token) throw new Error("请填写访问 token。");
  return { address: url.toString().replace(/\/+$/, ""), token };
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "认证失败，请检查 token。";
    if (error.code === "session_mismatch") return "当前会话已改变，正在同步；请确认内容后再操作。";
    if (error.code === "busy") return "Agent 仍在工作，请等运行结束后再切换会话。";
    if (error.code === "not_found") return "该会话或审批已不存在，请刷新后再试。";
    if (error.status === 503) return "server 正在关闭，请稍后重新连接。";
    return error.message;
  }
  if (error instanceof TypeError) return "连接失败，请检查地址、网络和反向代理 CORS 配置。";
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "请求超时，尚未确认是否送达；请先同步状态。";
    return error.message;
  }
  return "操作失败，请稍后重试。";
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

  send(sessionId: string, message: string, delivery: "auto" | "queue"): Promise<MessageReceipt> {
    return this.request("/v1/messages", { session_id: sessionId, message, delivery });
  }

  abort(sessionId: string): Promise<{ stopping: true }> {
    return this.request("/v1/abort", { session_id: sessionId });
  }

  decide(sessionId: string, id: string, decision: "allow" | "reject"): Promise<{ resolved: true }> {
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
          throw new ApiError(0, "invalid_stream", "入口未返回事件流，请检查反向代理路由。");
        }
      },
      onmessage(message) {
        if (!message.data) return;
        const event = JSON.parse(message.data) as ServerEvent;
        if (event.schema_version !== 1) {
          throw new ApiError(0, "unsupported_schema", "server 协议版本不兼容。");
        }
        callbacks.onEvent(event);
      },
      onclose() {
        throw new Error("事件连接已断开，正在重连。");
      },
      onerror(error) {
        if (error instanceof ApiError && (error.status === 401 || error.status < 500)) throw error;
        if (error instanceof SyntaxError) throw new Error("事件数据无法解析，请检查 server 版本。");
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
      body?.error?.message ?? `请求失败（${response.status}），请检查反向代理入口。`,
    );
  }
  if (!body) throw new ApiError(0, "invalid_response", "入口未返回 JSON，请检查反向代理路由。");
  if (body.schema_version !== 1)
    throw new ApiError(0, "unsupported_schema", "server 协议版本不兼容。");
  return body.data as T;
}
