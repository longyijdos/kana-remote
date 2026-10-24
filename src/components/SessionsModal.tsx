import { createAnimation, IonContent, IonHeader, IonModal } from "@ionic/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { errorMessage } from "../api/client";
import type { SavedSession } from "../api/types";
import { currentApi, handleActionError, reconnect } from "../state/connection";
import { useClientStore } from "../state/store";
import { ModalHeader } from "./Toolbar";
import { Button, IconButton, Spinner } from "./ui";

function confirmationAnimation(element: HTMLElement, entering: boolean) {
  const root = element.shadowRoot as ShadowRoot;
  return createAnimation()
    .addElement(element)
    .duration(180)
    .easing("ease-out")
    .addAnimation([
      createAnimation()
        .addElement(root.querySelectorAll("ion-backdrop"))
        .fromTo(
          "opacity",
          entering ? "0" : "var(--backdrop-opacity)",
          entering ? "var(--backdrop-opacity)" : "0",
        ),
      createAnimation()
        .addElement(root.querySelectorAll(".modal-wrapper"))
        .fromTo("opacity", entering ? "0" : "1", entering ? "1" : "0"),
    ]);
}

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
  const queryClient = useQueryClient();
  const confirmation = useRef<HTMLIonModalElement>(null);
  const reducedMotion = useReducedMotion();
  const [deleteTarget, setDeleteTarget] = useState<SavedSession | null>(null);
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
  const remove = useMutation({
    mutationFn: (id: string) => currentApi().deleteSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    onError: handleActionError,
  });
  const unavailable = disabled || change.isPending || remove.isPending || status !== "connected";
  const saved =
    sessions.data?.sessions
      .filter((session) => session.id !== active)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [];
  return (
    <>
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
                <div key={session.id} className="surface-card relative">
                  <button
                    type="button"
                    className="flex w-full min-w-0 flex-col gap-2 rounded-2xl bg-transparent p-4 pr-16 text-left text-foreground transition-colors hover:bg-muted/30 disabled:opacity-40 motion-reduce:transition-none"
                    disabled={unavailable}
                    onClick={() => change.mutate(session.id)}
                  >
                    <strong className="min-h-6 break-words text-sm font-medium leading-6">
                      {session.title || "Untitled"}
                    </strong>
                    <small className="text-xs text-muted-foreground">
                      {new Date(session.updatedAt).toLocaleString("en", { hourCycle: "h23" })}{" "}
                      {change.isPending && change.variables === session.id ? " · Resuming…" : ""}
                    </small>
                  </button>
                  <IconButton
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    icon={Trash2}
                    label="Delete session"
                    disabled={unavailable}
                    busy={remove.isPending && remove.variables === session.id}
                    onClick={() => setDeleteTarget(session)}
                  />
                </div>
              ))}
            </div>
          </div>
        </IonContent>
      </IonModal>
      <IonModal
        ref={confirmation}
        isOpen={deleteTarget !== null}
        className="confirmation-modal"
        aria-labelledby="delete-session-title"
        aria-describedby="delete-session-description"
        animated={!reducedMotion}
        enterAnimation={(element) => confirmationAnimation(element, true)}
        leaveAnimation={(element) => confirmationAnimation(element, false)}
        onDidDismiss={() => setDeleteTarget(null)}
      >
        <div className="p-6 text-foreground">
          <h2 id="delete-session-title" className="m-0 text-lg font-semibold tracking-tight">
            Delete session?
          </h2>
          <p
            id="delete-session-description"
            className="mb-0 mt-2 text-sm leading-6 text-muted-foreground"
          >
            This session will be permanently deleted.
          </p>
          <div className="mt-6 flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => void confirmation.current?.dismiss()}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={unavailable}
              onClick={() => {
                if (!deleteTarget) return;
                remove.mutate(deleteTarget.id);
                void confirmation.current?.dismiss();
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </IonModal>
    </>
  );
}
