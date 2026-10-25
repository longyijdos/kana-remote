import type { Goal, ScheduledInput, Snapshot } from "../api/types";

export interface AgendaSummary {
  /** Only a goal that is still running; finished goals stay in the Agenda sheet. */
  goal: Goal | null;
  /** Unfinished todo progress. */
  todos: { done: number; total: number } | null;
  next: ScheduledInput | null;
  scheduled: number;
}

export function agendaSummary(snapshot: Snapshot | null): AgendaSummary | null {
  const goal = snapshot?.goal?.status === "active" ? snapshot.goal : null;
  const items = snapshot?.todo ?? [];
  const done = items.filter((item) => item.status === "completed").length;
  const todos = done < items.length ? { done, total: items.length } : null;
  const scheduled = snapshot?.input_queue.scheduled ?? [];
  if (!goal && !todos && !scheduled.length) return null;
  return { goal, todos, next: scheduled[0] ?? null, scheduled: scheduled.length };
}

export const goalStatusLabels: Record<Goal["status"], string> = {
  active: "In progress",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
  round_limit: "Round limit reached",
};

const pad = (value: number) => String(value).padStart(2, "0");
const dayStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Local wall time: "14:30", "Tomorrow 09:00" or "Oct 28 09:00". */
export function formatDue(dueAt: string, now = new Date()): string {
  const date = new Date(dueAt);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const days = Math.round((dayStart(date) - dayStart(now)) / 86_400_000);
  if (days === 0) return time;
  if (days === 1) return `Tomorrow ${time}`;
  return `${date.toLocaleDateString("en", { month: "short", day: "numeric" })} ${time}`;
}

/** "30 min", "2 h" or "1 h 30 min". */
export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** "in 25 min", "in 2 h 5 min", or "due now" once the time has passed. */
export function formatCountdown(dueAt: string, now = new Date()): string {
  const minutes = Math.ceil((new Date(dueAt).getTime() - now.getTime()) / 60_000);
  return minutes <= 0 ? "due now" : `in ${formatInterval(minutes)}`;
}
