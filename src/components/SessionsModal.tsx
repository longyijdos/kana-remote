import { createAnimation, IonContent, IonHeader, IonModal } from "@ionic/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatWhen(timestamp: string): string {
  const date = new Date(timestamp);
  const seconds = (date.getTime() - Date.now()) / 1_000;
  const elapsed = Math.abs(seconds);
  if (elapsed < 60) return "just now";
  if (elapsed < 3_600) return relative.format(Math.round(seconds / 60), "minute");
  if (elapsed < 86_400) return relative.format(Math.round(seconds / 3_600), "hour");
  if (elapsed < 7 * 86_400) return relative.format(Math.round(seconds / 86_400), "day");
  return date.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
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
  const session = useClientStore((state) => state.snapshot?.session);
  const active = session?.id;
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
      .filter((item) => item.id !== active)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [];
  const started = session?.timeline[0]?.timestamp;
  const messageCount =
    session?.messages.filter(
      (message) =>
        message.role === "assistant" ||
        (message.role === "user" && message.provenance.kind === "user_input"),
    ).length ?? 0;
  return (
    <>
      <IonModal isOpen={open} onDidDismiss={onClose} className="sheet-modal">
        <IonHeader className="app-header">
          <ModalHeader title="Sessions" onClose={onClose} />
        </IonHeader>
        <IonContent>
          <div className="mx-auto max-w-xl px-5 py-5">
            <section className="rounded-2xl bg-muted/60 p-4">
              <h3 className="m-0 text-sm font-medium">Current session</h3>
              <p className="mb-0 mt-1 text-[13px] text-muted-foreground">
                {session
                  ? [
                      started ? `Started ${formatWhen(started)}` : "Just started",
                      plural(messageCount, "message"),
                    ].join(" · ")
                  : "Syncing…"}
              </p>
              <Button
                variant="secondary"
                className="mt-4 w-full"
                disabled={unavailable}
                onClick={() => change.mutate(null)}
              >
                {change.isPending && change.variables === null ? (
                  <Spinner />
                ) : (
                  <Plus className="size-4" strokeWidth={2} aria-hidden="true" />
                )}
                Start a new session
              </Button>
              <p className="mb-0 mt-2 text-xs leading-5 text-muted-foreground">
                The current session is saved and can be resumed later.
              </p>
            </section>
            <h2 className="mb-1 mt-7 px-1 text-[13px] font-medium text-muted-foreground">
              Saved sessions
            </h2>
            {sessions.isPending && (
              <div className="flex items-center gap-3 px-1 py-3 text-sm text-muted-foreground">
                <Spinner />
                <span>Loading</span>
              </div>
            )}
            {sessions.isError && (
              <div className="form-error px-1">
                <p>{errorMessage(sessions.error)}</p>
                <Button variant="secondary" onClick={() => void sessions.refetch()}>
                  Retry
                </Button>
              </div>
            )}
            {!sessions.isPending && !sessions.isError && !saved.length && (
              <p className="px-1 py-3 text-sm text-muted-foreground">No saved sessions yet.</p>
            )}
            <ul className="m-0 list-none divide-y divide-border p-0">
              {saved.map((item) => (
                <li key={item.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="-mx-1 flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl bg-transparent px-2 py-3 text-left text-foreground transition-colors hover:bg-muted/50 disabled:opacity-40 motion-reduce:transition-none"
                    disabled={unavailable}
                    onClick={() => change.mutate(item.id)}
                  >
                    <span className="line-clamp-2 break-words text-sm font-medium leading-6">
                      {item.title || "Untitled"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {change.isPending && change.variables === item.id
                        ? "Resuming…"
                        : formatWhen(item.updatedAt)}
                    </span>
                  </button>
                  <IconButton
                    small
                    className="text-muted-foreground/70"
                    icon={Trash2}
                    label="Delete session"
                    disabled={unavailable}
                    busy={remove.isPending && remove.variables === item.id}
                    onClick={() => setDeleteTarget(item)}
                  />
                </li>
              ))}
            </ul>
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
