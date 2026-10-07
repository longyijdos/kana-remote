import { create } from "zustand";
import type { ConnectionSettings, ServerEvent, Snapshot } from "../api/types";
import { applyEvent, projectActivity, type TranscriptActivity } from "./events";

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
  setStatus: (status: ConnectionStatus, error?: string | null) => void;
  receive: (event: ServerEvent) => void;
  notify: (message: string | null) => void;
}

export const useClientStore = create<ClientState>((set) => ({
  settings: null,
  hydrated: false,
  status: "disconnected",
  snapshot: null,
  connectionError: null,
  notice: null,
  activity: null,
  setStatus: (status, connectionError = null) => set({ status, connectionError }),
  receive: (event) =>
    set((state) => {
      if (
        event.type !== "snapshot" &&
        event.type !== "session.changed" &&
        event.session_id !== state.snapshot?.session?.id
      )
        return state;
      const snapshot = applyEvent(state.snapshot, event);
      return { snapshot, activity: projectActivity(state.activity, event, snapshot) };
    }),
  notify: (notice) => set({ notice }),
}));
