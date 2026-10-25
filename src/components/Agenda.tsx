import { IonContent, IonHeader, IonModal } from "@ionic/react";
import { AlarmClock, ListChecks, Target } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { Snapshot } from "../api/types";
import { type AgendaSummary, formatCountdown, formatDue, goalStatusLabels } from "../state/agenda";
import { Todos } from "./ToolBlocks";
import { ModalHeader } from "./Toolbar";

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
  const goal = snapshot?.goal;
  const todos = snapshot?.todo ?? [];
  const scheduled = snapshot?.input_queue.scheduled ?? [];
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} className="sheet-modal">
      <IonHeader className="app-header">
        <ModalHeader title="Agenda" onClose={onClose} />
      </IonHeader>
      <IonContent>
        <div className="mx-auto max-w-xl px-5 py-5">
          <Section title="Goal">
            {goal ? (
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
            ) : (
              <Empty>No goal.</Empty>
            )}
          </Section>
          <Section title="Todos">
            {todos.length ? (
              <div className="px-1">
                <Todos items={todos} />
              </div>
            ) : (
              <Empty>No todos.</Empty>
            )}
          </Section>
          <Section title="Scheduled">
            {scheduled.length ? (
              <ul className="m-0 list-none divide-y divide-border p-0">
                {scheduled.map((item) => (
                  <li key={item.id} className="px-1 py-3">
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="font-medium tabular-nums">{formatDue(item.dueAt, now)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCountdown(item.dueAt, now)} ·{" "}
                        {item.origin === "user" ? "Set by you" : "Set by Kana"}
                      </span>
                    </div>
                    <p className="mb-0 mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-muted-foreground">
                      {item.message}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing scheduled.</Empty>
            )}
          </Section>
        </div>
      </IonContent>
    </IonModal>
  );
}
