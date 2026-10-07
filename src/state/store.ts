import { create } from "zustand";
import type { ConnectionSettings, ServerEvent, Snapshot } from "../api/types";
import { applyEvent } from "./events";

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
  compacting: boolean;
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
  compacting: false,
  setStatus: (status, connectionError = null) => set({ status, connectionError }),
  receive: (event) =>
    set((state) => ({
      snapshot: applyEvent(state.snapshot, event),
      compacting:
        event.type === "context.compaction_started"
          ? true
          : [
                "snapshot",
                "session.changed",
                "context.compacted",
                "run.completed",
                "run.failed",
              ].includes(event.type)
            ? false
            : state.compacting,
    })),
  notify: (notice) => set({ notice }),
}));
