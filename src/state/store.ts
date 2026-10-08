import { create } from "zustand";
import type { AssistantMessage, ConnectionSettings, ServerEvent, Snapshot } from "../api/types";
import { applyEvent, projectActivity, type TranscriptActivity } from "./events";
import { StreamingText } from "./streaming-text";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unauthorized"
  | "error";

interface ClientState {
  settings: ConnectionSettings | null;
  hydrated: boolean;
  status: ConnectionStatus;
  snapshot: Snapshot | null;
  connectionError: string | null;
  notice: string | null;
  activity: TranscriptActivity | null;
  displayAssistant: AssistantMessage | null;
  catchUpText: () => void;
  resetText: () => void;
  setStatus: (status: ConnectionStatus, error?: string | null) => void;
  receive: (event: ServerEvent) => void;
  notify: (message: string | null) => void;
}

export const useClientStore = create<ClientState>((set, get) => {
  const text = new StreamingText({ onChange: (displayAssistant) => set({ displayAssistant }) });
  return {
    settings: null,
    hydrated: false,
    status: "disconnected",
    snapshot: null,
    connectionError: null,
    notice: null,
    activity: null,
    displayAssistant: null,
    catchUpText: () => text.catchUp(),
    resetText: () => text.reset(),
    setStatus: (status, connectionError = null) => set({ status, connectionError }),
    receive: (event) => {
      const state = get();
      if (
        event.type !== "snapshot" &&
        event.type !== "session.changed" &&
        event.session_id !== state.snapshot?.session?.id
      )
        return;
      const snapshot = applyEvent(state.snapshot, event);
      set({ snapshot, activity: projectActivity(state.activity, event, snapshot) });
      text.receive(event, snapshot);
    },
    notify: (notice) => set({ notice }),
  };
});
