import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { closeOutline } from "ionicons/icons";
import { errorMessage } from "../api/client";
import { currentApi, handleActionError, reconnect } from "../state/connection";
import { useClientStore } from "../state/store";

export function SessionsModal({
  open,
  onClose,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  disabled: boolean;
}) {
  const status = useClientStore((state) => state.status);
  const active = useClientStore((state) => state.snapshot?.session?.id);
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => currentApi().sessions(),
    enabled: open && status === "connected",
    refetchOnWindowFocus: false,
  });
  const change = useMutation({
    mutationFn: (id: string | null) =>
      id ? currentApi().resumeSession(id) : currentApi().newSession(),
    onSuccess() {
      reconnect();
      onClose();
    },
    onError: handleActionError,
  });
  const unavailable = disabled || change.isPending || status !== "connected";
  const saved =
    sessions.data?.sessions
      .filter((session) => session.id !== active)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [];
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} className="sheet-modal">
      <IonHeader>
        <IonToolbar>
          <IonTitle>Sessions</IonTitle>
          <IonButtons slot="end">
            <IonButton aria-label="Close" onClick={onClose}>
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="sheet-body">
          <div className="active-session">
            <span className="status-dot" />
            <div>
              <strong>Current session</strong>
              <code>{active ?? "Syncing"}</code>
            </div>
          </div>
          <IonButton expand="block" disabled={unavailable} onClick={() => change.mutate(null)}>
            {change.isPending && change.variables === null ? (
              <IonSpinner name="crescent" />
            ) : (
              "New session"
            )}
          </IonButton>
          <h2 className="section-label">Saved sessions</h2>
          {sessions.isPending && (
            <div className="loading-inline">
              <IonSpinner name="crescent" />
              <span>Loading</span>
            </div>
          )}
          {sessions.isError && (
            <div className="form-error">
              <p>{errorMessage(sessions.error)}</p>
              <IonButton size="small" fill="outline" onClick={() => void sessions.refetch()}>
                Retry
              </IonButton>
            </div>
          )}
          {!sessions.isPending && !sessions.isError && !saved.length && (
            <p className="muted">No saved sessions.</p>
          )}
          <div className="session-list">
            {saved.map((session) => (
              <button
                type="button"
                key={session.id}
                className="session-item"
                disabled={unavailable}
                onClick={() => change.mutate(session.id)}
              >
                <strong>{session.title || "Untitled"}</strong>
                <span>{session.cwd}</span>
                <small>
                  {new Date(session.updatedAt).toLocaleString("en")}{" "}
                  {change.isPending && change.variables === session.id ? " · Resuming…" : ""}
                </small>
              </button>
            ))}
          </div>
        </div>
      </IonContent>
    </IonModal>
  );
}
