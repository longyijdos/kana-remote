import { IonContent, IonHeader, IonModal, IonPage } from "@ionic/react";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import { refreshOutline, settingsOutline } from "ionicons/icons";
import { useLayoutEffect, useRef, useState } from "react";
import { ApprovalCard } from "../components/ApprovalCard";
import { Composer } from "../components/Composer";
import { ConnectionForm } from "../components/ConnectionForm";
import { MessageList } from "../components/MessageList";
import { SessionsModal } from "../components/SessionsModal";
import { ModalHeader, Toolbar } from "../components/Toolbar";
import { IconButton, Spinner } from "../components/ui";
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
  const overlay = useRef<HTMLDivElement>(null);
  const [bottomInset, setBottomInset] = useState(96);
  useLayoutEffect(() => {
    const element = overlay.current;
    if (!element) return;
    const update = () => setBottomInset(Math.ceil(element.getBoundingClientRect().height) + 12);
    const observer = new ResizeObserver(update);
    update();
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
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
        <Toolbar
          status={statusLabel}
          disabled={busy}
          onSessions={() => setSessionsOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
      </IonHeader>
      <IonContent scrollY={false}>
        <div className="relative flex h-full flex-col">
          {!online && connectionError && (
            <div
              className="surface-card mx-4 mt-3 flex items-center gap-3 px-4 py-2 text-sm"
              role="alert"
            >
              <div className="min-w-0 flex-1 break-words">{connectionError}</div>
              <IconButton
                icon={
                  status === "unauthorized" || status === "error" ? settingsOutline : refreshOutline
                }
                label={
                  status === "unauthorized" || status === "error"
                    ? "Connection settings"
                    : "Reconnect"
                }
                onClick={() =>
                  status === "unauthorized" || status === "error"
                    ? setSettingsOpen(true)
                    : reconnect()
                }
              />
            </div>
          )}
          {snapshot ? (
            <MessageList
              key={snapshot.session?.id ?? "none"}
              snapshot={snapshot}
              activity={activity ?? (send.isPending ? "working" : null)}
              bottomInset={bottomInset}
            />
          ) : (
            <div className="grid flex-1 place-items-center">
              {status !== "error" && status !== "unauthorized" && <Spinner className="size-5" />}
            </div>
          )}
        </div>
        <div
          ref={overlay}
          slot="fixed"
          className="composer-overlay absolute inset-x-0 bottom-0 z-20 px-3 sm:px-6"
        >
          <div className="mx-auto w-full max-w-3xl">
            {approvals.length > 0 && (
              <div className="mb-3 flex max-h-[35vh] flex-col gap-3 overflow-y-auto">
                {approvals.map((approval) => (
                  <ApprovalCard key={approval.id} approval={approval} disabled={!online || busy} />
                ))}
              </div>
            )}
            {snapshot?.run?.error && (
              <p
                className="surface-card run-error mb-3 max-h-24 overflow-y-auto px-4 py-3"
                role="alert"
              >
                {snapshot.run.error.message}
              </p>
            )}
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={() => send.mutate(draft)}
              onStop={() => stop.mutate()}
              active={active}
              pending={send.isPending || stop.isPending}
              canSend={canSend}
              canStop={online && !busy}
            />
          </div>
        </div>
      </IonContent>
      <IonModal
        isOpen={settingsOpen}
        onDidDismiss={() => setSettingsOpen(false)}
        className="sheet-modal"
      >
        <IonHeader className="app-header">
          <ModalHeader title="Connection" onClose={() => setSettingsOpen(false)} />
        </IonHeader>
        <IonContent>
          <div className="mx-auto max-w-xl px-6 py-6">
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
