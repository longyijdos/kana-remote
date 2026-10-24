import { IonPopover } from "@ionic/react";
import { Ellipsis, History, type LucideIcon, Plug, X } from "lucide-react";
import { useState } from "react";
import type { Snapshot } from "../api/types";
import type { TranscriptActivity } from "../state/events";
import type { ConnectionStatus } from "../state/store";
import { IconButton } from "./ui";

export type PresenceTone = "idle" | "active" | "attention" | "offline" | "pending";
export interface Presence {
  label: string;
  tone: PresenceTone;
}

const lowContext = 20;

export function contextRemaining(context: Snapshot["context"]): number | null {
  if (!context || context.estimated_tokens === null || context.context_limit <= 0) return null;
  return (
    100 -
    Math.min(100, Math.max(0, Math.round((context.estimated_tokens / context.context_limit) * 100)))
  );
}

export function presence({
  status,
  snapshot,
  activity,
  sending,
}: {
  status: ConnectionStatus;
  snapshot: Snapshot | null;
  activity: TranscriptActivity | null;
  sending: boolean;
}): Presence {
  if (status === "connecting") return { label: "Connecting…", tone: "pending" };
  if (status === "reconnecting") return { label: "Reconnecting…", tone: "pending" };
  if (status === "unauthorized") return { label: "Unauthorized", tone: "offline" };
  if (status !== "connected" || !snapshot) return { label: "Offline", tone: "offline" };
  if (snapshot.approvals.length) return { label: "Waiting for approval", tone: "attention" };
  if (snapshot.running || sending) {
    if (activity === "compacting") return { label: "Compacting context…", tone: "active" };
    const tool = snapshot.tools.find((item) => item.status === "running" && !item.paused);
    if (tool) return { label: `Running ${tool.name}…`, tone: "active" };
    if (
      snapshot.assistant?.content.some(
        (content) => content.type === "hosted_tool" && content.status === "in_progress",
      )
    )
      return { label: "Searching the web…", tone: "active" };
    if (snapshot.assistant?.content.some((content) => content.type === "text" && content.text))
      return { label: "Typing…", tone: "active" };
    return { label: "Working…", tone: "active" };
  }
  const remaining = contextRemaining(snapshot.context);
  if (remaining !== null && remaining <= lowContext)
    return { label: `Online · ${remaining}% context left`, tone: "attention" };
  return { label: "Online", tone: "idle" };
}

const dotTones: Record<PresenceTone, string> = {
  idle: "bg-emerald-500",
  active: "bg-foreground animate-pulse motion-reduce:animate-none",
  attention: "bg-amber-500",
  offline: "bg-rose-500",
  pending: "bg-muted-foreground animate-pulse motion-reduce:animate-none",
};

const buds = [
  { x: 65, y: 15, scale: 1 },
  { x: 35, y: 35, scale: 0.85 },
  { x: 85, y: 45, scale: 0.85 },
];

// Vector redraw of Kana's pixel logo: one sprig, three buds.
export function KanaMark({ height = 30 }: { height?: number }) {
  return (
    <svg className="shrink-0" height={height} viewBox="18 0 86 72" aria-hidden="true">
      <g fill="none" stroke="#52a742" strokeWidth="5.5" strokeLinecap="round">
        <path d="M44 67C54 57 65 49 65 25" />
        <path d="M65 37Q55 33 42 35" />
        <path d="M64 48Q73 48 79 45" />
      </g>
      {buds.map((bud) => (
        <g key={bud.x} transform={`translate(${bud.x} ${bud.y}) scale(${bud.scale})`}>
          <g fill="#9edc5b">
            <circle cy="-7" r="5.2" />
            <circle cx="7" r="5.2" />
            <circle cy="7" r="5.2" />
            <circle cx="-7" r="5.2" />
          </g>
          <circle r="4.6" fill="#58b849" />
        </g>
      ))}
    </svg>
  );
}

function ContextMeter({ remaining }: { remaining: number | null }) {
  return (
    <div className="px-3 pb-3 pt-2.5">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-muted-foreground">Context</span>
        <span className="tabular-nums text-foreground" title="Context remaining">
          {remaining === null ? "Unavailable" : `${remaining}% left`}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${remaining !== null && remaining <= lowContext ? "bg-amber-500" : "bg-foreground/70"}`}
          style={{ width: `${remaining ?? 0}%` }}
        />
      </div>
    </div>
  );
}

export function Toolbar({
  presence,
  context,
  disabled,
  onSessions,
  onSettings,
}: {
  presence: Presence;
  context: Snapshot["context"];
  disabled: boolean;
  onSessions: () => void;
  onSettings: () => void;
}) {
  const [menuEvent, setMenuEvent] = useState<Event>();
  function choose(action: () => void) {
    setMenuEvent(undefined);
    action();
  }
  return (
    <div className="flex min-h-16 items-center gap-3 px-4">
      <KanaMark />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold leading-5 tracking-tight">Kana</span>
        <div
          className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground"
          role="status"
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${dotTones[presence.tone]}`}
            aria-hidden="true"
          />
          <span className="truncate">{presence.label}</span>
        </div>
      </div>
      <IconButton
        className="-mr-2"
        icon={Ellipsis}
        label="Menu"
        onClick={(event) => setMenuEvent(event.nativeEvent)}
      />
      <IonPopover
        isOpen={Boolean(menuEvent)}
        event={menuEvent}
        onDidDismiss={() => setMenuEvent(undefined)}
        className="app-menu"
        alignment="end"
      >
        <div className="flex flex-col p-1.5">
          <ContextMeter remaining={contextRemaining(context)} />
          <div className="mx-3 my-1 h-px bg-border" />
          <MenuItem icon={History} disabled={disabled} onClick={() => choose(onSessions)}>
            Sessions
          </MenuItem>
          <MenuItem icon={Plug} disabled={disabled} onClick={() => choose(onSettings)}>
            Connection
          </MenuItem>
        </div>
      </IonPopover>
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  ...props
}: {
  icon: LucideIcon;
  children: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-lg bg-transparent px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-40 motion-reduce:transition-none"
      {...props}
    >
      <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      {children}
    </button>
  );
}

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex min-h-16 items-center justify-between px-5">
      <h2 className="m-0 text-lg font-semibold tracking-tight">{title}</h2>
      <IconButton className="-mr-2" icon={X} label="Close" onClick={onClose} />
    </div>
  );
}
