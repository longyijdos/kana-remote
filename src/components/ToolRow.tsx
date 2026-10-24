import { Ban, Check, ChevronRight, Globe, Pause, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { MessageImage, ToolResultMessage, ToolState } from "../api/types";
import { CopyButton } from "./CopyButton";
import { Spinner } from "./ui";

export function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? "";
}

function summarize(args: unknown): string {
  if (args && typeof args === "object") {
    const fields = args as Record<string, unknown>;
    for (const field of [
      "command",
      "path",
      "file_path",
      "pattern",
      "query",
      "url",
      "description",
    ]) {
      if (typeof fields[field] === "string") return fields[field];
    }
  }
  return "";
}

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

function StatusIcon({
  canceled,
  failed,
  paused,
  running,
  hosted,
}: {
  canceled: boolean;
  failed: boolean;
  paused: boolean;
  running: boolean;
  hosted: boolean;
}) {
  const className = "size-3.5";
  if (canceled) return <Ban className={className} strokeWidth={2} />;
  if (failed) return <X className={`${className} text-rose-500`} strokeWidth={2.25} />;
  if (paused) return <Pause className={`${className} text-amber-500`} strokeWidth={2.25} />;
  if (running) return <Spinner className="size-3.5 text-foreground" />;
  if (hosted) return <Globe className={className} strokeWidth={2} />;
  return <Check className={className} strokeWidth={2.25} />;
}

function Section({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="mb-1 flex min-h-8 items-center justify-between text-xs text-muted-foreground">
        <span>{title}</span>
        <CopyButton value={value} />
      </div>
      <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-5 select-text">
        {value}
      </pre>
    </div>
  );
}

export function ToolRow({
  name,
  args,
  state,
  result,
  hostedStatus,
}: {
  name: string;
  args: unknown;
  state?: ToolState;
  result?: ToolResultMessage;
  hostedStatus?: "in_progress" | "completed" | "canceled";
}) {
  const [expanded, setExpanded] = useState(false);
  const payload =
    result?.result ?? (state?.result as { result?: unknown } | undefined)?.result ?? state?.result;
  const cancellation = payload as { canceled?: boolean; status?: string; reason?: string } | null;
  const canceled = Boolean(
    state?.canceled ||
      hostedStatus === "canceled" ||
      cancellation?.canceled === true ||
      (cancellation?.status === "canceled" && cancellation.reason === "run_aborted"),
  );
  const failed = Boolean(state?.is_error || result?.isError);
  const completed =
    Boolean(result) || state?.status === "completed" || hostedStatus === "completed";
  const running = !canceled && (state?.status === "running" || hostedStatus === "in_progress");
  const paused = Boolean(state?.paused) && !completed && !canceled;
  const label = canceled
    ? "Canceled"
    : failed
      ? "Failed"
      : paused
        ? "Waiting for approval"
        : completed
          ? "Completed"
          : running
            ? "Running"
            : "Prepared";
  const output = result?.content ?? formatValue(state?.result ?? state?.partial_result);
  const details = formatValue(args ?? state?.arguments);
  const preview = summarize(args ?? state?.arguments);
  return (
    <div className="-mx-2">
      <button
        type="button"
        className="flex min-h-9 w-full items-center gap-2.5 rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 motion-reduce:transition-none"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
          <StatusIcon
            canceled={canceled}
            failed={failed}
            paused={paused}
            running={running}
            hosted={hostedStatus !== undefined}
          />
        </span>
        <span className="sr-only">{label}: </span>
        <span className={`shrink-0 font-medium ${running ? "text-foreground" : ""}`}>{name}</span>
        {preview && (
          <span
            className={`min-w-0 flex-1 truncate font-mono text-[13px] ${canceled ? "line-through" : ""}`}
          >
            {preview}
          </span>
        )}
        {!preview && <span className="flex-1" />}
        {result?.durationMs !== undefined && result.durationMs >= 1_000 && (
          <span className="shrink-0 text-xs tabular-nums">
            {(result.durationMs / 1_000).toFixed(1)}s
          </span>
        )}
        <ChevronRight
          className={`size-3.5 shrink-0 opacity-50 transition-[rotate] duration-[180ms] ease-out motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="details"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="mx-2 mb-2 mt-1 space-y-3 rounded-xl bg-muted/60 px-3.5 pb-3.5 pt-1.5">
              {details && <Section title="Arguments" value={details} />}
              {output ? (
                <Section title="Output" value={output} />
              ) : (
                <p className="m-0 pt-2 text-xs text-muted-foreground">
                  {running ? "Running…" : "No output"}
                </p>
              )}
              {result?.artifact && (
                <p className="m-0 break-all text-xs text-muted-foreground">
                  Artifact: {result.artifact.locator}
                </p>
              )}
              <Images images={result?.images} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
