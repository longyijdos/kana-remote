import { Ban, Check, ChevronRight, Globe, Pause, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import type { MessageImage, ToolResultMessage, ToolState } from "../api/types";
import {
  type HostedToolAction,
  hostedToolTitle,
  type ToolOutcome,
  type ToolPhase,
  toolDetails,
  toolLabel,
  toolMeta,
  toolTarget,
} from "../tools/describe";
import { ToolBlocks } from "./ToolBlocks";
import { Spinner } from "./ui";

export function Images({ images }: { images?: MessageImage[] }) {
  if (!images?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {images.map((image, index) => (
        <img
          className="h-auto max-h-72 max-w-full rounded-xl object-contain"
          key={image.data}
          src={`data:${image.mimeType};base64,${image.data}`}
          width={image.width}
          height={image.height}
          alt={`Attachment ${index + 1}`}
          loading="lazy"
        />
      ))}
    </div>
  );
}

type RowStatus = ToolPhase | "paused";

function StatusIcon({ status, hosted }: { status: RowStatus; hosted?: boolean }) {
  const className = "size-3.5";
  if (status === "cancelled") return <Ban className={className} strokeWidth={2} />;
  if (status === "failed") return <X className={`${className} text-rose-500`} strokeWidth={2.25} />;
  if (status === "paused")
    return <Pause className={`${className} text-amber-500`} strokeWidth={2.25} />;
  if (status === "running") return <Spinner className="size-3.5 text-foreground" />;
  if (hosted) return <Globe className={className} strokeWidth={2} />;
  return <Check className={className} strokeWidth={2.25} />;
}

const statusNames: Record<RowStatus, string> = {
  running: "Running",
  paused: "Waiting for approval",
  done: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function Row({
  status,
  label,
  target,
  meta,
  hosted,
  children,
}: {
  status: RowStatus;
  label: string;
  target?: string;
  meta?: string;
  hosted?: boolean;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandable = Boolean(children);
  const summary = (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
        <StatusIcon status={status} hosted={hosted} />
      </span>
      <span className="sr-only">{statusNames[status]}: </span>
      <span
        className={`shrink-0 ${status === "running" ? "text-foreground" : ""} ${status === "failed" ? "text-rose-600 dark:text-rose-400" : ""}`}
      >
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 truncate font-mono text-[13px] ${status === "cancelled" ? "line-through" : ""}`}
      >
        {target?.replace(/\s+/g, " ")}
      </span>
      {meta && <span className="shrink-0 text-xs tabular-nums">{meta}</span>}
    </>
  );
  const rowClass =
    "flex min-h-9 w-full items-center gap-2.5 rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-sm text-muted-foreground";
  return (
    <div className="-mx-2">
      {expandable ? (
        <button
          type="button"
          className={`${rowClass} transition-colors hover:bg-muted/60 motion-reduce:transition-none`}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {summary}
          <ChevronRight
            className={`size-3.5 shrink-0 opacity-50 transition-[rotate] duration-[180ms] ease-out motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className={rowClass}>{summary}</div>
      )}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="details"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="mx-2 mb-2 mt-1 space-y-2 rounded-xl bg-muted/60 px-3.5 pb-3 pt-1.5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function stateOutcome(state: ToolState | undefined): ToolOutcome {
  const value = state?.result ?? state?.partial_result;
  const wrapped = value as { content?: unknown; result?: unknown } | undefined;
  if (wrapped && typeof wrapped === "object" && typeof wrapped.content === "string")
    return { content: wrapped.content, result: wrapped.result, isError: state?.is_error };
  return { result: value, isError: state?.is_error };
}

export function ToolRow({
  name,
  args,
  state,
  result,
}: {
  name: string;
  args: unknown;
  state?: ToolState;
  result?: ToolResultMessage;
}) {
  const outcome: ToolOutcome = result
    ? {
        content: result.content,
        result: result.result,
        isError: result.isError,
        artifact: result.artifact,
      }
    : stateOutcome(state);
  const cancellation = outcome.result as { cancelled?: boolean; status?: string; reason?: string };
  const cancelled = Boolean(
    state?.cancelled ||
      cancellation?.cancelled === true ||
      (cancellation?.status === "cancelled" && cancellation.reason === "run_aborted"),
  );
  const completed = Boolean(result) || state?.status === "completed";
  const phase: ToolPhase = cancelled
    ? "cancelled"
    : outcome.isError
      ? "failed"
      : completed
        ? "done"
        : "running";
  const status: RowStatus = phase === "running" && state?.paused ? "paused" : phase;
  const call = { name, args: args ?? state?.arguments };
  const details = toolDetails(call, completed || cancelled ? outcome : undefined);
  const duration =
    result?.durationMs !== undefined && result.durationMs >= 1_000
      ? `${(result.durationMs / 1_000).toFixed(1)}s`
      : undefined;
  const meta = [completed ? toolMeta(call, outcome) : undefined, duration]
    .filter(Boolean)
    .join(" · ");
  const hasDetails = details.length > 0 || Boolean(result?.images?.length);
  return (
    <Row
      status={status}
      label={toolLabel(call, phase, outcome.result)}
      target={toolTarget(call, outcome.result)}
      meta={meta || undefined}
    >
      {hasDetails && (
        <>
          <ToolBlocks blocks={details} />
          <Images images={result?.images} />
        </>
      )}
    </Row>
  );
}

export function HostedToolRow({
  name,
  status,
  action,
}: {
  name: string;
  status: "in_progress" | "completed" | "cancelled";
  action?: HostedToolAction;
}) {
  const title = hostedToolTitle(name, status, action);
  return (
    <Row
      status={status === "in_progress" ? "running" : status === "cancelled" ? "cancelled" : "done"}
      label={title.label}
      target={title.target}
      hosted
    />
  );
}
