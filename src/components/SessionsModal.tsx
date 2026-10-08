import { IonContent, IonHeader, IonModal } from "@ionic/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { errorMessage } from "../api/client";
import { currentApi, handleActionError, reconnect } from "../state/connection";
import { useClientStore } from "../state/store";
import { ModalHeader } from "./Toolbar";
import { Button, Spinner } from "./ui";

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
      <IonHeader className="app-header">
        <ModalHeader title="Sessions" onClose={onClose} />
      </IonHeader>
      <IonContent>
        <div className="mx-auto max-w-xl px-6 py-6">
          <div className="surface-card mb-4 flex flex-col gap-2 p-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <strong className="text-sm font-medium">Current session</strong>
              <code className="break-all font-mono text-xs text-muted-foreground">
                {active ?? "Syncing"}
              </code>
            </div>
          </div>
          <Button className="w-full" disabled={unavailable} onClick={() => change.mutate(null)}>
            {change.isPending && change.variables === null ? <Spinner /> : "New session"}
          </Button>
          <h2 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">Saved sessions</h2>
          {sessions.isPending && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Spinner />
              <span>Loading</span>
            </div>
          )}
          {sessions.isError && (
            <div className="form-error">
              <p>{errorMessage(sessions.error)}</p>
              <Button variant="secondary" onClick={() => void sessions.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {!sessions.isPending && !sessions.isError && !saved.length && (
            <p className="text-sm text-muted-foreground">No saved sessions.</p>
          )}
          <div className="flex flex-col gap-3">
            {saved.map((session) => (
              <button
                type="button"
                key={session.id}
                className="surface-card flex w-full flex-col gap-2 p-4 text-left text-foreground hover:border-muted-foreground"
                disabled={unavailable}
                onClick={() => change.mutate(session.id)}
              >
                <strong className="break-words text-sm font-medium">
                  {session.title || "Untitled"}
                </strong>
                <span className="break-all text-xs text-muted-foreground">{session.cwd}</span>
                <small className="text-xs text-muted-foreground">
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
