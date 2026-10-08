import { IonIcon } from "@ionic/react";
import {
  checkmarkCircleOutline,
  chevronDownOutline,
  closeCircleOutline,
  terminalOutline,
} from "ionicons/icons";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { MessageImage, ToolResultMessage, ToolState } from "../api/types";
import { CopyButton } from "./CopyButton";

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

export function ToolCard({
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
  const canceled =
    state?.canceled ||
    hostedStatus === "canceled" ||
    cancellation?.canceled === true ||
    (cancellation?.status === "canceled" && cancellation.reason === "run_aborted");
  const failed = state?.is_error || result?.isError || hostedStatus === "canceled";
  const completed =
    Boolean(result) || state?.status === "completed" || hostedStatus === "completed";
  const running = !canceled && (state?.status === "running" || hostedStatus === "in_progress");
  const label = canceled
    ? "Canceled"
    : failed
      ? "Failed"
      : state?.paused
        ? "Paused"
        : completed
          ? "Completed"
          : running
            ? "Running"
            : "Prepared";
  const output = result?.content ?? formatValue(state?.result ?? state?.partial_result);
  const details = formatValue(args ?? state?.arguments);
  const preview = summarize(args ?? state?.arguments);
  return (
    <div className="surface-card my-3 overflow-hidden">
      <button
        type="button"
        className="flex min-h-14 w-full items-center gap-3 border-0 bg-transparent px-4 py-3 text-left text-foreground"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={`flex shrink-0 text-lg ${
            failed && !canceled
              ? "text-[var(--ion-color-danger)]"
              : running && !state?.paused
                ? "text-foreground"
                : "text-muted-foreground"
          }`}
        >
          <IonIcon
            icon={
              canceled || failed
                ? closeCircleOutline
                : completed
                  ? checkmarkCircleOutline
                  : terminalOutline
            }
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex min-w-0 items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
            <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
          </span>
          {preview && (
            <span className="truncate font-mono text-sm text-muted-foreground">{preview}</span>
          )}
        </span>
        <IonIcon
          className={`shrink-0 text-sm text-muted-foreground transition-transform duration-[180ms] ease-out motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          icon={chevronDownOutline}
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
            <div className="space-y-4 border-t border-solid border-border p-4">
              {details && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm text-muted-foreground">
                    <span>Arguments</span>
                    <CopyButton value={details} />
                  </div>
                  <pre className="m-0 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-6 select-text">
                    {details}
                  </pre>
                </div>
              )}
              {output && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Output
                      {result?.durationMs !== undefined
                        ? ` · ${(result.durationMs / 1_000).toFixed(1)}s`
                        : ""}
                    </span>
                    <CopyButton value={output} />
                  </div>
                  <pre className="m-0 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-6 select-text">
                    {output}
                  </pre>
                </div>
              )}
              {!output && (
                <p className="m-0 text-sm text-muted-foreground">
                  {running ? "Running…" : "No output"}
                </p>
              )}
              {result?.artifact && (
                <p className="m-0 break-all text-sm text-muted-foreground">
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
