import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { QueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage, KanaApi, normalizeSettings } from "../api/client";
import type { ConnectionSettings } from "../api/types";
import { useClientStore } from "./store";

const settingsKey = "kana.connection";
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
let api: KanaApi | null = null;
let stream: AbortController | null = null;

export function currentApi(): KanaApi {
  if (!api || useClientStore.getState().status !== "connected")
    throw new Error("Connect and sync before continuing.");
  return api;
}

export function currentSessionId(): string {
  const id = useClientStore.getState().snapshot?.session?.id;
  if (!id) throw new Error("No active session on the server.");
  return id;
}

export async function connect(settings: ConnectionSettings): Promise<void> {
  const normalized = normalizeSettings(settings);
  await Preferences.set({ key: settingsKey, value: JSON.stringify(normalized) });
  activate(normalized);
}

function activate(settings: ConnectionSettings): void {
  stream?.abort();
  useClientStore.getState().resetText();
  queryClient.clear();
  api = new KanaApi(settings);
  useClientStore.setState({
    settings,
    snapshot: null,
    connectionError: null,
    notice: null,
    activity: null,
  });
  reconnect();
}

export function disconnect(): void {
  stream?.abort();
  useClientStore.getState().resetText();
  stream = null;
  api = null;
  queryClient.clear();
  useClientStore.setState({
    status: "disconnected",
    snapshot: null,
    connectionError: null,
    activity: null,
  });
}

export function reconnect(): void {
  if (!api) return;
  stream?.abort();
  const controller = new AbortController();
  stream = controller;
  const client = api;
  const store = useClientStore.getState();
  store.setStatus(store.snapshot ? "reconnecting" : "connecting");
  void client
    .events(controller.signal, {
      onEvent(event) {
        if (controller.signal.aborted || client !== api) return;
        useClientStore.getState().receive(event);
        if (event.type === "snapshot") {
          useClientStore.getState().setStatus("connected");
          void queryClient.invalidateQueries({ queryKey: ["sessions"] });
        }
        if (
          ["session.changed", "run.completed", "run.failed", "context.compacted"].includes(
            event.type,
          )
        ) {
          queueMicrotask(() => {
            if (!controller.signal.aborted) reconnect();
          });
        }
      },
      onRetry(error) {
        if (!controller.signal.aborted) {
          useClientStore.getState().catchUpText();
          useClientStore.getState().setStatus("reconnecting", errorMessage(error));
        }
      },
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted || client !== api) return;
      useClientStore.getState().catchUpText();
      useClientStore
        .getState()
        .setStatus(
          error instanceof ApiError && error.status === 401 ? "unauthorized" : "error",
          errorMessage(error),
        );
    });
}

export function handleActionError(error: unknown): void {
  const store = useClientStore.getState();
  store.notify(errorMessage(error));
  if (error instanceof ApiError && error.status === 401) {
    stream?.abort();
    store.setStatus("unauthorized", errorMessage(error));
  } else if (error instanceof ApiError && (error.status === 409 || error.status === 404))
    reconnect();
}

export function installConnectionLifecycle(): () => void {
  let disposed = false;
  void Preferences.get({ key: settingsKey })
    .then(({ value }) => {
      if (disposed) return;
      useClientStore.setState({ hydrated: true });
      if (value) activate(normalizeSettings(JSON.parse(value) as ConnectionSettings));
    })
    .catch((error: unknown) => {
      if (!disposed)
        useClientStore.setState({
          hydrated: true,
          connectionError: errorMessage(error),
          status: "error",
        });
    });

  function resume() {
    const status = useClientStore.getState().status;
    if (status !== "unauthorized" && status !== "error") reconnect();
  }
  function pause() {
    stream?.abort();
    useClientStore.getState().catchUpText();
    if (api && useClientStore.getState().status === "connected")
      useClientStore.getState().setStatus("reconnecting");
  }
  function visibility() {
    if (document.hidden) pause();
    else resume();
  }
  const nativeListener = Capacitor.isNativePlatform()
    ? CapacitorApp.addListener("appStateChange", ({ isActive }) => (isActive ? resume() : pause()))
    : null;
  if (!Capacitor.isNativePlatform()) document.addEventListener("visibilitychange", visibility);
  window.addEventListener("online", resume);
  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("online", resume);
    if (nativeListener) void nativeListener.then((listener) => listener.remove());
    disconnect();
  };
}
