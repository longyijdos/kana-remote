import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import {
  arrowUpOutline,
  closeOutline,
  layersOutline,
  refreshOutline,
  settingsOutline,
  stopOutline,
} from "ionicons/icons";
import { useState } from "react";
import { ApprovalCard } from "../components/ApprovalCard";
import { ConnectionForm } from "../components/ConnectionForm";
import { MessageList } from "../components/MessageList";
import { SessionsModal } from "../components/SessionsModal";
import { currentApi, currentSessionId, handleActionError, reconnect } from "../state/connection";
import { useClientStore } from "../state/store";

const connectionLabels = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  unauthorized: "Unauthorized",
  error: "Connection failed",
};

export function ChatPage() {
  const snapshot = useClientStore((state) => state.snapshot);
  const status = useClientStore((state) => state.status);
  const connectionError = useClientStore((state) => state.connectionError);
  const activity = useClientStore((state) => state.activity);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const busy = useIsMutating() > 0;
  const online = status === "connected";
  const running = snapshot?.running ?? false;
  const approvals = snapshot?.approvals ?? [];
  const send = useMutation({
    mutationFn: (message: string) => {
      if (useClientStore.getState().snapshot?.running)
        throw new Error("Wait for the current run to finish.");
      return currentApi().send(currentSessionId(), message);
    },
    onSuccess(_receipt, message) {
      setDraft((value) => (value === message ? "" : value));
    },
    onError: handleActionError,
  });
  const stop = useMutation({
    mutationFn: () => currentApi().abort(currentSessionId()),
    onError: handleActionError,
  });
  const active = running || send.isPending;
  const canSend = online && Boolean(snapshot?.session) && !active && !busy && Boolean(draft.trim());
  const statusLabel = !online
    ? connectionLabels[status]
    : activity === "compacting"
      ? "Compacting"
      : activity === "preparing"
        ? "Preparing"
        : activity === "prepared"
          ? "Prepared"
          : active
            ? snapshot?.tools.some((tool) => tool.status === "running")
              ? "Running"
              : snapshot?.assistant?.content.some(
                    (content) => content.type === "hosted_tool" && content.status === "in_progress",
                  )
                ? "Searching"
                : snapshot?.assistant?.content.some(
                      (content) => content.type === "text" && content.text,
                    )
                  ? "Responding"
                  : "Working"
            : snapshot?.run?.status === "failed" || snapshot?.run?.outcome === "error"
              ? "Failed"
              : snapshot?.run?.outcome === "aborted"
                ? "Stopped"
                : "Idle";

  return (
    <IonPage>
      <IonHeader className="app-header">
        <IonToolbar>
          <div className="header-layout">
            <div className="header-brand" role="img" aria-label="Kana">
              <span className="agent-mark small">K</span>
              <span className="brand-name">ana</span>
            </div>
            <div className="header-status" role="status">
              <span
                className={active && online && activity !== "prepared" ? "working-dot" : "idle-dot"}
              />
              {statusLabel}
            </div>
            <IonButtons className="header-actions">
              <IonButton
                aria-label="Sessions"
                title="Sessions"
                disabled={busy}
                onClick={() => setSessionsOpen(true)}
              >
                <IonIcon slot="icon-only" icon={layersOutline} />
              </IonButton>
              <IonButton
                aria-label="Connection settings"
                title="Connection settings"
                disabled={busy}
                onClick={() => setSettingsOpen(true)}
              >
                <IonIcon slot="icon-only" icon={settingsOutline} />
              </IonButton>
            </IonButtons>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollY={false}>
        <div className="chat-layout">
          {!online && connectionError && (
            <div className="connection-banner" role="alert">
              <div>{connectionError}</div>
              <IonButton
                size="small"
                fill="clear"
                aria-label={
                  status === "unauthorized" || status === "error"
                    ? "Connection settings"
                    : "Reconnect"
                }
                onClick={() =>
                  status === "unauthorized" || status === "error"
                    ? setSettingsOpen(true)
                    : reconnect()
                }
              >
                <IonIcon
                  slot="icon-only"
                  icon={
                    status === "unauthorized" || status === "error"
                      ? settingsOutline
                      : refreshOutline
                  }
                />
              </IonButton>
            </div>
          )}
          {snapshot ? (
            <MessageList
              key={snapshot.session?.id ?? "none"}
              snapshot={snapshot}
              activity={activity ?? (send.isPending ? "working" : null)}
            />
          ) : (
            <div className="loading-chat">
              {status !== "error" && status !== "unauthorized" && <IonSpinner name="crescent" />}
            </div>
          )}
        </div>
      </IonContent>
      <IonFooter className="chat-footer">
        <div className="footer-body">
          {approvals.length > 0 && (
            <div className="approvals-panel">
              {approvals.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} disabled={!online || busy} />
              ))}
            </div>
          )}
          {snapshot?.run?.error && (
            <p className="run-error" role="alert">
              {snapshot.run.error.message}
            </p>
          )}
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSend) send.mutate(draft);
            }}
          >
            <IonTextarea
              aria-label="Message"
              placeholder="Message"
              autoGrow
              rows={1}
              value={draft}
              onIonInput={(event) => setDraft(event.detail.value ?? "")}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && canSend) {
                  event.preventDefault();
                  send.mutate(draft);
                }
              }}
            />
            <IonButton
              className="send-button"
              size="small"
              type={active ? "button" : "submit"}
              color={active ? "medium" : "primary"}
              aria-label={active ? "Stop" : "Send"}
              title={active ? "Stop" : "Send"}
              disabled={active ? !online || busy : !canSend}
              onClick={() => {
                if (active && online && !busy) stop.mutate();
              }}
            >
              {send.isPending || stop.isPending ? (
                <IonSpinner name="crescent" />
              ) : (
                <IonIcon slot="icon-only" icon={active ? stopOutline : arrowUpOutline} />
              )}
            </IonButton>
          </form>
        </div>
      </IonFooter>
      <IonModal
        isOpen={settingsOpen}
        onDidDismiss={() => setSettingsOpen(false)}
        className="sheet-modal"
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Connection</IonTitle>
            <IonButtons slot="end">
              <IonButton aria-label="Close" onClick={() => setSettingsOpen(false)}>
                <IonIcon slot="icon-only" icon={closeOutline} />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <div className="sheet-body">
            <ConnectionForm
              onConnected={() => setSettingsOpen(false)}
              onDisconnected={() => setSettingsOpen(false)}
            />
          </div>
        </IonContent>
      </IonModal>
      <SessionsModal
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        disabled={active || busy || approvals.length > 0}
      />
    </IonPage>
  );
}
