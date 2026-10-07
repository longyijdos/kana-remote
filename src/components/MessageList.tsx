import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { AssistantMessage, Snapshot, UserMessage } from "../api/types";
import { visibleMessages } from "../state/events";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import { Images, ToolCard } from "./ToolCard";

const MessageRow = memo(function MessageRow({
  message,
  snapshot,
}: {
  message: UserMessage | AssistantMessage;
  snapshot: Snapshot;
}) {
  if (message.role === "user") {
    return (
      <article className="message-row user-row">
        <div className="user-message">
          <div className="user-text">{message.content}</div>
          <Images images={message.images} />
        </div>
      </article>
    );
  }
  const results = snapshot.session?.messages.filter((item) => item.role === "tool") ?? [];
  const text = message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n\n");
  return (
    <article className="message-row assistant-row">
      <div className="assistant-label">
        <span className="agent-mark small">K</span>
        <span>Kana</span>
        {snapshot.assistant?.id === message.id && <span className="live-label">实时</span>}
      </div>
      {message.content.map((content, index) => {
        if (content.type === "thinking") return null;
        if (content.type === "text")
          return content.text ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: Protocol content indexes are stable while streaming.
            <Markdown key={`text-${index}`} text={content.text} />
          ) : null;
        if (content.type === "tool_call")
          return (
            <ToolCard
              key={content.id}
              name={content.name}
              args={content.rawArgs && !content.args ? content.rawArgs : content.args}
              state={snapshot.tools.find((item) => item.tool_call_id === content.id)}
              result={results.find((item) => item.toolCallId === content.id)}
            />
          );
        if (content.type === "hosted_tool")
          return (
            <ToolCard
              key={content.id}
              name={content.name}
              args={content.action}
              hostedStatus={content.status}
            />
          );
        return null;
      })}
      {message.stopReason === "error" && <p className="message-warning">响应未完成。</p>}
      {message.stopReason === "aborted" && <p className="muted">本次响应已停止。</p>}
      {text && snapshot.assistant?.id !== message.id && (
        <div className="message-actions">
          <CopyButton value={text} label="复制回复" />
        </div>
      )}
    </article>
  );
});

export function MessageList({ snapshot }: { snapshot: Snapshot }) {
  const rows = useMemo(() => visibleMessages(snapshot), [snapshot]);
  const virtuoso = useRef<VirtuosoHandle>(null);
  const atBottom = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  useEffect(() => {
    if (atBottom.current && rows.length)
      virtuoso.current?.scrollToIndex({ index: rows.length - 1, align: "end", behavior: "auto" });
  }, [rows]);
  if (!rows.length)
    return (
      <div className="empty-chat">
        <span className="agent-mark">K</span>
        <h2>连接到了你的 Agent</h2>
        <p>
          发出指令，剩下的交给 Kana。
          <br />
          离开 App 后，server 上的任务会继续运行。
        </p>
      </div>
    );
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
        computeItemKey={(_index, message) => message.id}
        itemContent={(_index, message) => <MessageRow message={message} snapshot={snapshot} />}
      />
      {showLatest && (
        <button
          type="button"
          className="latest-button"
          onClick={() =>
            virtuoso.current?.scrollToIndex({
              index: rows.length - 1,
              align: "end",
              behavior: "smooth",
            })
          }
        >
          ↓ 回到最新
        </button>
      )}
    </div>
  );
}
