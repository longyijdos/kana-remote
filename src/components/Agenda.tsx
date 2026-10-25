import { IonContent, IonHeader, IonModal } from "@ionic/react";
import { useMutation } from "@tanstack/react-query";
import { AlarmClock, ListChecks, Target, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { Goal, ScheduledInput, Snapshot } from "../api/types";
import {
  type AgendaSummary,
  formatCountdown,
  formatDue,
  formatInterval,
  goalStatusLabels,
} from "../state/agenda";
import { currentApi, currentSessionId, handleActionError } from "../state/connection";
import { useClientStore } from "../state/store";
import { Todos } from "./ToolBlocks";
import { ModalHeader } from "./Toolbar";
import { Button, IconButton, Spinner } from "./ui";

const icon = "size-3.5 shrink-0";

export function AgendaStrip({ summary, onOpen }: { summary: AgendaSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="surface-card mb-2 flex max-w-full items-center gap-3 rounded-full px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
      aria-label="Open agenda"
      onClick={onOpen}
    >
      {summary.goal && (
        <span className="flex min-w-0 items-center gap-1.5">
          <Target className={icon} strokeWidth={2} aria-hidden="true" />
          <span className="truncate">{summary.goal.objective}</span>
        </span>
      )}
      {summary.todos && (
        <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
          <ListChecks className={icon} strokeWidth={2} aria-hidden="true" />
          {summary.todos.done}/{summary.todos.total}
        </span>
      )}
      {summary.next && (
        <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
          <AlarmClock className={icon} strokeWidth={2} aria-hidden="true" />
          {formatDue(summary.next.dueAt)}
          {summary.scheduled > 1 && ` +${summary.scheduled - 1}`}
        </span>
      )}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h2 className="mb-2 mt-0 px-1 text-[13px] font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="m-0 px-1 py-1 text-sm text-muted-foreground">{children}</p>;
}

/** Re-renders every half minute while open so countdowns stay current. */
function useNow(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function GoalCard({ goal }: { goal: Goal }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-4">
      <p className="m-0 whitespace-pre-wrap break-words text-sm font-medium leading-6">
        {goal.objective}
      </p>
      <p className="mb-0 mt-1 text-[13px] text-muted-foreground">
        {goalStatusLabels[goal.status]} · Round {goal.admittedRounds} of {goal.maxRounds}
      </p>
      {goal.detail && (
        <p className="mb-0 mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-muted-foreground">
          {goal.detail}
        </p>
      )}
    </div>
  );
}

function GoalSection({
  goal,
  online,
  running,
}: {
  goal: Goal | null | undefined;
  online: boolean;
  running: boolean;
}) {
  const [composing, setComposing] = useState(false);
  const [objective, setObjective] = useState("");
  const start = useMutation({
    mutationFn: (text: string) => currentApi().startGoal(currentSessionId(), text),
    onSuccess() {
      setObjective("");
      setComposing(false);
    },
    onError: handleActionError,
  });
  const cancel = useMutation({
    mutationFn: () => currentApi().cancelGoal(currentSessionId()),
    onError: handleActionError,
  });
  const active = goal?.status === "active";
  return (
    <Section title="Goal">
      {goal ? <GoalCard goal={goal} /> : !composing && <Empty>No goal.</Empty>}
      {active ? (
        <Button
          variant="secondary"
          className="mt-3 w-full"
          disabled={!online || cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          {cancel.isPending ? <Spinner /> : <X className="size-4" strokeWidth={2} />}
          Stop after this round
        </Button>
      ) : composing ? (
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (objective.trim()) start.mutate(objective.trim());
          }}
        >
          <textarea
            className="field-input min-h-24 resize-none"
            aria-label="Goal objective"
            placeholder="What should Kana keep working on until it is done?"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setComposing(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={!online || running || start.isPending || !objective.trim()}
            >
              {start.isPending && <Spinner />}
              Start goal
            </Button>
          </div>
          {running && (
            <p className="m-0 text-xs text-muted-foreground">Available once Kana is idle.</p>
          )}
        </form>
      ) : (
        <Button
          variant="secondary"
          className="mt-3 w-full"
          disabled={!online}
          onClick={() => setComposing(true)}
        >
          <Target className="size-4" strokeWidth={2} aria-hidden="true" />
          Start a goal
        </Button>
      )}
    </Section>
  );
}

function ScheduledSection({
  scheduled,
  online,
  now,
}: {
  scheduled: ScheduledInput[];
  online: boolean;
  now: Date;
}) {
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [repeat, setRepeat] = useState(false);
  const afterMinutes = Number(minutes);
  const validMinutes = Number.isInteger(afterMinutes) && afterMinutes >= 1 && afterMinutes <= 1440;
  const create = useMutation({
    mutationFn: () =>
      currentApi().schedule(currentSessionId(), {
        message: message.trim(),
        afterMinutes,
        repeat,
      }),
    onSuccess() {
      setMessage("");
      setComposing(false);
    },
    onError: handleActionError,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => currentApi().cancelSchedule(currentSessionId(), id),
    onError: handleActionError,
  });
  return (
    <Section title="Scheduled">
      {scheduled.length ? (
        <ul className="m-0 list-none divide-y divide-border p-0">
          {scheduled.map((item) => (
            <li key={item.id} className="flex items-start gap-1 py-3 pl-1">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium tabular-nums">{formatDue(item.dueAt, now)}</span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      item.everyMinutes && `Every ${formatInterval(item.everyMinutes)}`,
                      formatCountdown(item.dueAt, now),
                      item.origin === "user" ? "Set by you" : "Set by Kana",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <p className="mb-0 mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-muted-foreground">
                  {item.message}
                </p>
              </div>
              <IconButton
                small
                className="-mt-1 text-muted-foreground/70"
                icon={X}
                label="Cancel scheduled message"
                disabled={!online || cancel.isPending}
                busy={cancel.isPending && cancel.variables === item.id}
                onClick={() => cancel.mutate(item.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        !composing && <Empty>Nothing scheduled.</Empty>
      )}
      {composing ? (
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (message.trim() && validMinutes) create.mutate();
          }}
        >
          <textarea
            className="field-input min-h-20 resize-none"
            aria-label="Scheduled message"
            placeholder="Message to send Kana"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{repeat ? "Every" : "In"}</span>
            <input
              className="field-input w-24 text-center tabular-nums"
              aria-label="Minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value.replace(/\D/g, ""))}
            />
            <span className="text-muted-foreground">minutes</span>
            <label className="ml-auto flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--ion-color-primary)]"
                checked={repeat}
                onChange={(event) => setRepeat(event.target.checked)}
              />
              Repeat
            </label>
          </div>
          {!validMinutes && minutes !== "" && (
            <p className="m-0 text-xs text-muted-foreground">Choose 1 to 1440 minutes.</p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setComposing(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={!online || create.isPending || !message.trim() || !validMinutes}
            >
              {create.isPending && <Spinner />}
              Schedule
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="secondary"
          className="mt-3 w-full"
          disabled={!online}
          onClick={() => setComposing(true)}
        >
          <AlarmClock className="size-4" strokeWidth={2} aria-hidden="true" />
          Schedule a message
        </Button>
      )}
    </Section>
  );
}

export function AgendaModal({
  open,
  onClose,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: Snapshot | null;
}) {
  const now = useNow(open);
  const online =
    useClientStore((state) => state.status === "connected") && Boolean(snapshot?.session);
  const todos = snapshot?.todo ?? [];
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} className="sheet-modal">
      <IonHeader className="app-header">
        <ModalHeader title="Agenda" onClose={onClose} />
      </IonHeader>
      <IonContent>
        <div className="mx-auto max-w-xl px-5 py-5">
          <GoalSection goal={snapshot?.goal} online={online} running={snapshot?.running ?? false} />
          <Section title="Todos">
            {todos.length ? (
              <div className="px-1">
                <Todos items={todos} />
              </div>
            ) : (
              <Empty>No todos.</Empty>
            )}
          </Section>
          <ScheduledSection
            scheduled={snapshot?.input_queue.scheduled ?? []}
            online={online}
            now={now}
          />
        </div>
      </IonContent>
    </IonModal>
  );
}
