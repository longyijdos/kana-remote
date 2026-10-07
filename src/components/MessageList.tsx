import { IonIcon, IonSpinner } from "@ionic/react";
import { arrowDownOutline, checkmarkOutline } from "ionicons/icons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { AssistantMessage, Snapshot, UserMessage } from "../api/types";
import { type TranscriptActivity, visibleMessages } from "../state/events";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import { Images, ToolCard } from "./ToolCard";

type TranscriptRow =
  | { kind: "message"; id: string; message: UserMessage | AssistantMessage }
  | { kind: "activity"; id: string; activity: TranscriptActivity };
const activityLabels = {
  working: "Working…",
  preparing: "Preparing tools…",
  prepared: "Prepared tools",
  compacting: "Compacting context…",
};

const MessageRow = memo(function MessageRow({
  message,
  snapshot,
}: {
  message: UserMessage | AssistantMessage;
  snapshot: Snapshot;
}) {
  if (message.role === "user")
    return (
      <article className="message-row user-row">
        <div className="user-message">
          <div className="user-text">{message.content}</div>
          <Images images={message.images} />
        </div>
      </article>
    );
  const results = snapshot.session?.messages.filter((item) => item.role === "tool") ?? [];
  const text = message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n\n");
  return (
    <article className="message-row assistant-row">
      <div className="assistant-label" role="img" aria-label="Kana">
        <span className="agent-mark small">K</span>
        <span className="brand-name">ana</span>
      </div>
      {message.content.map((content, index) => {
        if (content.type === "thinking") return null;
        if (content.type === "text")
          return content.text ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: Protocol content indexes are stable while streaming.
            <Markdown key={`text-${index}`} text={content.text} />
          ) : null;
        if (content.type === "tool_call") {
          const state = snapshot.tools.find((item) => item.tool_call_id === content.id);
          const result = results.find((item) => item.toolCallId === content.id);
          if (!state && !result) return null;
          return (
            <ToolCard
              key={content.id}
              name={content.name}
              args={content.args}
              state={state}
              result={result}
            />
          );
        }
        return (
          <ToolCard
            key={content.id}
            name={content.name}
            args={content.action}
            hostedStatus={content.status}
          />
        );
      })}
      {message.stopReason === "error" && <p className="message-warning">Response incomplete.</p>}
      {message.stopReason === "aborted" && <p className="muted">Stopped.</p>}
      {text && snapshot.assistant?.id !== message.id && (
        <div className="message-actions">
          <CopyButton value={text} label="Copy response" />
        </div>
      )}
    </article>
  );
});

export function MessageList({
  snapshot,
  activity,
}: {
  snapshot: Snapshot;
  activity: TranscriptActivity | null;
}) {
  const rows = useMemo<TranscriptRow[]>(() => {
    const messages: TranscriptRow[] = visibleMessages(snapshot).map((message) => ({
      kind: "message",
      id: message.id,
      message,
    }));
    if (activity)
      messages.push({
        kind: "activity",
        id: `activity-${snapshot.run?.id ?? "pending"}`,
        activity,
      });
    return messages;
  }, [snapshot, activity]);
  const virtuoso = useRef<VirtuosoHandle>(null);
  const atBottom = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  useEffect(() => {
    if (atBottom.current && rows.length)
      virtuoso.current?.scrollToIndex({ index: rows.length - 1, align: "end", behavior: "auto" });
  }, [rows]);
  if (!rows.length) return <div className="empty-chat" />;
  return (
    <div className="message-list">
      <Virtuoso
        ref={virtuoso}
        data={rows}
        className="conversation-scroll ion-content-scroll-host"
        initialTopMostItemIndex={{ index: rows.length - 1, align: "end" }}
        followOutput="auto"
        atBottomThreshold={80}
        atBottomStateChange={(bottom) => {
          atBottom.current = bottom;
          setShowLatest(!bottom);
        }}
        computeItemKey={(_index, row) => row.id}
        itemContent={(_index, row) =>
          row.kind === "message" ? (
            <MessageRow message={row.message} snapshot={snapshot} />
          ) : (
            <div className="message-row transcript-activity" role="status">
              {row.activity === "prepared" ? (
                <IonIcon icon={checkmarkOutline} />
              ) : (
                <IonSpinner name="dots" />
              )}
              <span>{activityLabels[row.activity]}</span>
            </div>
          )
        }
      />
      {showLatest && (
        <button
          type="button"
          className="latest-button"
          aria-label="Scroll to latest"
          title="Scroll to latest"
          onClick={() =>
            virtuoso.current?.scrollToIndex({
              index: rows.length - 1,
              align: "end",
              behavior: "smooth",
            })
          }
        >
          <IonIcon icon={arrowDownOutline} />
        </button>
      )}
    </div>
  );
}
