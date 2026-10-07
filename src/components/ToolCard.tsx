import { IonIcon } from "@ionic/react";
import {
  checkmarkCircleOutline,
  chevronDownOutline,
  closeCircleOutline,
  terminalOutline,
} from "ionicons/icons";
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
    <div className="message-images">
      {images.map((image, index) => (
        <img
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
  return (
    <div className={`tool-card ${failed && !canceled ? "tool-failed" : ""}`}>
      <button
        type="button"
        className="tool-summary"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`tool-icon ${running && !state?.paused ? "tool-active" : ""}`}>
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
        <span className="tool-heading">
          <span className="tool-name">
            {name}
            <span className="tool-status">{label}</span>
          </span>
          <span className="tool-preview">{summarize(args ?? state?.arguments)}</span>
        </span>
        <IonIcon className={expanded ? "chevron expanded" : "chevron"} icon={chevronDownOutline} />
      </button>
      {expanded && (
        <div className="tool-details">
          {details && (
            <div>
              <div className="detail-label">
                <span>Arguments</span>
                <CopyButton value={details} />
              </div>
              <pre>{details}</pre>
            </div>
          )}
          {output && (
            <div>
              <div className="detail-label">
                <span>
                  Output
                  {result?.durationMs !== undefined
                    ? ` · ${(result.durationMs / 1_000).toFixed(1)}s`
                    : ""}
                </span>
                <CopyButton value={output} />
              </div>
              <pre>{output}</pre>
            </div>
          )}
          {!output && <p className="muted">{running ? "Running…" : "No output"}</p>}
          {result?.artifact && <p className="artifact-path">Artifact: {result.artifact.locator}</p>}
          <Images images={result?.images} />
        </div>
      )}
    </div>
  );
}
