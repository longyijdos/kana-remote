import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ApiError, KanaApi, normalizeSettings } from "../src/api/client";
import type { ServerEvent } from "../src/api/types";

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
beforeAll(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { fetch, setTimeout, clearTimeout },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: new EventTarget() });
});
afterAll(() => {
  if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
  else Reflect.deleteProperty(globalThis, "window");
  if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
  else Reflect.deleteProperty(globalThis, "document");
});

function response(data: unknown, status = 200) {
  return Response.json(
    { schema_version: 1, ...(status < 400 ? { data } : { error: data }) },
    { status },
  );
}

describe("HTTP and SSE transport", () => {
  test("keeps a reverse proxy base path and never places credentials in the URL", () => {
    expect(
      normalizeSettings({ address: " https://example.com/kana/ ", token: " secret " }),
    ).toEqual({ address: "https://example.com/kana", token: "secret" });
    expect(() =>
      normalizeSettings({ address: "https://example.com?token=secret", token: "secret" }),
    ).toThrow();
  });
  test("sends a plain message and all four approval decisions with Bearer auth", async () => {
    const requests: { path: string; auth: string | null; body: unknown }[] = [];
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(request) {
        requests.push({
          path: new URL(request.url).pathname,
          auth: request.headers.get("authorization"),
          body: await request.json(),
        });
        return response({ resolved: true });
      },
    });
    try {
      const api = new KanaApi({
        address: `${server.url.toString().replace(/\/$/, "")}/kana`,
        token: "secret",
      });
      await api.send("session-a", "第一条指令");
      await api.abort("session-a");
      await api.decide("session-a", "approval-a", "reject");
      for (const decision of ["allow", "always", "never"] as const) {
        await api.decide("session-a", "approval-a", decision);
      }
      expect(requests).toEqual([
        {
          path: "/kana/v1/messages",
          auth: "Bearer secret",
          body: { session_id: "session-a", message: "第一条指令" },
        },
        { path: "/kana/v1/abort", auth: "Bearer secret", body: { session_id: "session-a" } },
        {
          path: "/kana/v1/approvals/approval-a",
          auth: "Bearer secret",
          body: { session_id: "session-a", decision: "reject" },
        },
        ...["allow", "always", "never"].map((decision) => ({
          path: "/kana/v1/approvals/approval-a",
          auth: "Bearer secret",
          body: { session_id: "session-a", decision },
        })),
      ]);
    } finally {
      await server.stop(true);
    }
  });
  test("does not retry a failed write", async () => {
    let requests = 0;
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        requests++;
        return response({ code: "stopping", message: "Stopping" }, 503);
      },
    });
    try {
      const api = new KanaApi({
        address: server.url.toString().replace(/\/$/, ""),
        token: "secret",
      });
      await expect(api.send("session-a", "Work")).rejects.toMatchObject({ status: 503 });
      expect(requests).toBe(1);
    } finally {
      await server.stop(true);
    }
  });
  test("parses named SSE events, snapshots and UTF-8 text across chunks", async () => {
    const expected: ServerEvent[] = [
      {
        schema_version: 1,
        type: "snapshot",
        session_id: "session-a",
        run_id: null,
        data: { running: true },
      },
      {
        schema_version: 1,
        type: "assistant.delta",
        session_id: "session-a",
        run_id: "run-a",
        data: { delta: "流式回复" },
      },
    ];
    let auth: string | null = null;
    const encoder = new TextEncoder();
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      idleTimeout: 0,
      fetch(request) {
        auth = request.headers.get("authorization");
        const bytes = encoder.encode(
          `: heartbeat\n\n${expected.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("")}`,
        );
        return new Response(
          new ReadableStream({
            start(controller) {
              for (let offset = 0; offset < bytes.length; offset += 7)
                controller.enqueue(bytes.slice(offset, offset + 7));
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    });
    const controller = new AbortController();
    try {
      const received: ServerEvent[] = [];
      const api = new KanaApi({
        address: server.url.toString().replace(/\/$/, ""),
        token: "secret",
      });
      await api.events(controller.signal, {
        onEvent(event) {
          received.push(event);
          if (received.length === expected.length) controller.abort();
        },
        onRetry(error) {
          throw error;
        },
      });
      expect(auth).toBe("Bearer secret");
      expect(received).toEqual(expected);
    } finally {
      controller.abort();
      await server.stop(true);
    }
  });
  test("stops reconnecting after authentication failure", async () => {
    let requests = 0;
    let retries = 0;
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        requests++;
        return response({ code: "unauthorized", message: "Wrong token" }, 401);
      },
    });
    try {
      const api = new KanaApi({
        address: server.url.toString().replace(/\/$/, ""),
        token: "wrong",
      });
      await expect(
        api.events(new AbortController().signal, {
          onEvent() {},
          onRetry() {
            retries++;
          },
        }),
      ).rejects.toBeInstanceOf(ApiError);
      expect(requests).toBe(1);
      expect(retries).toBe(0);
    } finally {
      await server.stop(true);
    }
  });
});
