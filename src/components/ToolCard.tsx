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
  return "查看参数与输出";
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
          alt={`附件 ${index + 1}`}
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
  const failed = state?.is_error || result?.isError || hostedStatus === "canceled";
  const completed =
    Boolean(result) || state?.status === "completed" || hostedStatus === "completed";
  const running = state?.status === "running" || hostedStatus === "in_progress";
  const label = failed
    ? "执行失败"
    : state?.paused
      ? "已暂停"
      : completed
        ? "已完成"
        : running
          ? "执行中"
          : "待执行";
  const output = result?.content ?? formatValue(state?.result ?? state?.partial_result);
  const details = formatValue(args ?? state?.arguments);
  return (
    <div className={`tool-card ${failed ? "tool-failed" : ""}`}>
      <button
        type="button"
        className="tool-summary"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`tool-icon ${running && !state?.paused ? "tool-active" : ""}`}>
          <IonIcon
            icon={
              failed ? closeCircleOutline : completed ? checkmarkCircleOutline : terminalOutline
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
                <span>参数</span>
                <CopyButton value={details} />
              </div>
              <pre>{details}</pre>
            </div>
          )}
          {output && (
            <div>
              <div className="detail-label">
                <span>
                  输出
                  {result?.durationMs !== undefined
                    ? ` · ${(result.durationMs / 1_000).toFixed(1)} 秒`
                    : ""}
                </span>
                <CopyButton value={output} />
              </div>
              <pre>{output}</pre>
            </div>
          )}
          {!output && <p className="muted">{running ? "等待工具返回结果…" : "暂无输出"}</p>}
          {result?.artifact && (
            <p className="artifact-path">完整输出保存在 server：{result.artifact.locator}</p>
          )}
          <Images images={result?.images} />
        </div>
      )}
    </div>
  );
}
