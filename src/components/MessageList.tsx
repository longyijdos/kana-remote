import { IonIcon } from "@ionic/react";
import { arrowDownOutline, checkmarkOutline } from "ionicons/icons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { AssistantMessage, Snapshot, UserMessage } from "../api/types";
import { type TranscriptActivity, visibleMessages } from "../state/events";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import { Images, ToolCard } from "./ToolCard";
import { IconButton, Spinner } from "./ui";

type TranscriptRow =
  | { kind: "message"; id: string; message: UserMessage | AssistantMessage }
  | { kind: "activity"; id: string; activity: TranscriptActivity };
const activityLabels = {
  working: "Working…",
  preparing: "Preparing tools…",
  prepared: "Prepared tools",
  compacting: "Compacting context…",
};

function TranscriptSpacer({ context }: { context: number }) {
  return <div style={{ height: context }} aria-hidden="true" />;
}
const listComponents = { Footer: TranscriptSpacer };

const MessageRow = memo(function MessageRow({
  message,
  snapshot,
}: {
  message: UserMessage | AssistantMessage;
  snapshot: Snapshot;
}) {
  if (message.role === "user")
    return (
      <article className="mx-auto flex w-full max-w-3xl justify-end px-5 py-3 sm:px-6">
        <div className="max-w-[88%] rounded-2xl bg-muted px-4 py-3 text-base leading-7">
          <div className="whitespace-pre-wrap break-words select-text">{message.content}</div>
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
    <article className="mx-auto w-full max-w-3xl px-5 py-4 sm:px-6">
      {message.content.map((content, index) => {
        if (content.type === "thinking") return null;
        if (content.type === "text")
          return content.text ? (
            <Markdown
              // biome-ignore lint/suspicious/noArrayIndexKey: Protocol content indexes are stable while streaming.
              key={`text-${index}`}
              text={content.text}
              streaming={snapshot.running && snapshot.assistant?.id === message.id}
            />
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
      {message.stopReason === "error" && (
        <p className="message-warning my-3">Response incomplete.</p>
      )}
      {message.stopReason === "aborted" && (
        <p className="my-3 text-sm text-muted-foreground">Stopped.</p>
      )}
      {text && snapshot.assistant?.id !== message.id && (
        <div className="mt-3 flex items-center">
          <CopyButton value={text} label="Copy response" />
        </div>
      )}
    </article>
  );
});

export function MessageList({
  snapshot,
  activity,
  bottomInset,
}: {
  snapshot: Snapshot;
  activity: TranscriptActivity | null;
  bottomInset: number;
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
      virtuoso.current?.scrollToIndex({
        index: rows.length - 1,
        align: "end",
        offset: bottomInset,
        behavior: "auto",
      });
  }, [rows, bottomInset]);
  if (!rows.length) return <div className="flex-1" />;
  return (
    <div className="relative min-h-0 flex-1">
      <Virtuoso
        ref={virtuoso}
        data={rows}
        context={bottomInset}
        components={listComponents}
        className="ion-content-scroll-host h-full overflow-x-hidden"
        initialTopMostItemIndex={{ index: rows.length - 1, align: "end", offset: bottomInset }}
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
            <div
              className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-5 py-3 text-sm text-muted-foreground sm:px-6"
              role="status"
            >
              {row.activity === "prepared" ? <IonIcon icon={checkmarkOutline} /> : <Spinner />}
              <span>{activityLabels[row.activity]}</span>
            </div>
          )
        }
      />
      {showLatest && (
        <IconButton
          variant="secondary"
          icon={arrowDownOutline}
          label="Scroll to latest"
          className="absolute left-1/2 z-10 -translate-x-1/2"
          style={{ bottom: bottomInset + 12 }}
          onClick={() =>
            virtuoso.current?.scrollToIndex({
              index: rows.length - 1,
              align: "end",
              offset: bottomInset,
              behavior: "smooth",
            })
          }
        />
      )}
    </div>
  );
}
