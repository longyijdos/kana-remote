import { ArrowDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { AssistantMessage, Snapshot, UserMessage } from "../api/types";
import { type TranscriptActivity, visibleMessages } from "../state/events";
import { useClientStore } from "../state/store";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import { HostedToolRow, Images, ToolRow } from "./ToolRow";
import { IconButton } from "./ui";

type TranscriptContext = {
  bottomInset: number;
  activity: TranscriptActivity | null;
};
function TypingDots() {
  return (
    <span className="flex h-6 items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="size-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.16, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

function TranscriptFooter({ context }: { context: TranscriptContext }) {
  return (
    <>
      <AnimatePresence initial={false}>
        {context.activity && context.activity !== "prepared" && (
          <motion.div
            key="activity"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div
              className="mx-auto flex w-full max-w-3xl px-5 py-2 text-sm text-muted-foreground sm:px-6"
              role="status"
            >
              {context.activity === "compacting" ? (
                <span className="leading-6">Compacting context…</span>
              ) : (
                <>
                  <TypingDots />
                  <span className="sr-only">Working</span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div style={{ height: context.bottomInset }} aria-hidden="true" />
    </>
  );
}
const listComponents = { Footer: TranscriptFooter };

const MessageRow = memo(function MessageRow({
  message,
  snapshot,
  streaming,
}: {
  message: UserMessage | AssistantMessage;
  snapshot: Snapshot;
  streaming: boolean;
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
  const toolsOnly = !message.content.some(
    (content) => content.type === "text" && content.text.trim(),
  );
  return (
    <article className={`mx-auto w-full max-w-3xl px-5 sm:px-6 ${toolsOnly ? "py-0.5" : "py-4"}`}>
      {message.content.map((content, index) => {
        if (content.type === "thinking") return null;
        if (content.type === "text")
          return content.text ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: Protocol content indexes are stable while streaming.
            <div key={`text-${index}`} className="my-3 first:mt-0 last:mb-0">
              <Markdown text={content.text} streaming={streaming} />
            </div>
          ) : null;
        if (content.type === "tool_call") {
          const state = snapshot.tools.find((item) => item.tool_call_id === content.id);
          const result = results.find((item) => item.toolCallId === content.id);
          if (!state && !result) return null;
          return (
            <ToolRow
              key={content.id}
              name={content.name}
              args={content.args}
              state={state}
              result={result}
            />
          );
        }
        return (
          <HostedToolRow
            key={content.id}
            name={content.name}
            status={content.status}
            action={content.action}
          />
        );
      })}
      {message.stopReason === "error" && (
        <p className="message-warning my-3">Response incomplete.</p>
      )}
      {message.stopReason === "aborted" && (
        <p className="my-3 text-sm text-muted-foreground">Stopped.</p>
      )}
      {text && !streaming && (
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
  const displayAssistant = useClientStore((state) => state.displayAssistant);
  const messages = useMemo(
    () =>
      visibleMessages(snapshot).map((message) =>
        message.id === displayAssistant?.id ? displayAssistant : message,
      ),
    [snapshot, displayAssistant],
  );
  const context = useMemo(() => ({ bottomInset, activity }), [bottomInset, activity]);
  const virtuoso = useRef<VirtuosoHandle>(null);
  const following = useRef(true);
  const listHeight = useRef(0);
  const scrollPosition = useRef({ top: 0, height: 0 });
  const touchY = useRef<number | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  function setFollowing(value: boolean) {
    following.current = value;
    setShowLatest(!value);
  }
  useEffect(() => {
    if (following.current && messages.length)
      virtuoso.current?.scrollTo({
        top: listHeight.current,
        behavior: "auto",
      });
  }, [messages]);
  return (
    <div className="relative min-h-0 flex-1">
      <Virtuoso
        ref={virtuoso}
        data={messages}
        context={context}
        components={listComponents}
        className="ion-content-scroll-host h-full overflow-x-hidden"
        initialTopMostItemIndex={
          messages.length
            ? { index: messages.length - 1, align: "end", offset: bottomInset }
            : undefined
        }
        totalListHeightChanged={(height) => {
          listHeight.current = height;
          if (following.current) virtuoso.current?.scrollTo({ top: height, behavior: "auto" });
        }}
        onWheelCapture={(event) => {
          if (event.deltaY < 0) setFollowing(false);
        }}
        onTouchStartCapture={(event) => {
          touchY.current = event.touches[0].clientY;
        }}
        onTouchMoveCapture={(event) => {
          const y = event.touches[0].clientY;
          if (touchY.current !== null && y > touchY.current) setFollowing(false);
          touchY.current = y;
        }}
        onKeyDownCapture={(event) => {
          if (
            event.target === event.currentTarget &&
            (["ArrowUp", "PageUp", "Home"].includes(event.key) ||
              (event.key === " " && event.shiftKey))
          )
            setFollowing(false);
        }}
        onScrollCapture={(event) => {
          if (event.target !== event.currentTarget) return;
          const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
          const previous = scrollPosition.current;
          if (scrollTop < previous.top && scrollHeight === previous.height) setFollowing(false);
          else if (scrollTop > previous.top && Math.ceil(scrollTop + clientHeight) >= scrollHeight)
            setFollowing(true);
          scrollPosition.current = { top: scrollTop, height: scrollHeight };
        }}
        computeItemKey={(_index, message) => message.id}
        itemContent={(_index, message) => (
          <MessageRow
            message={message}
            snapshot={snapshot}
            streaming={snapshot.assistant?.id === message.id || displayAssistant?.id === message.id}
          />
        )}
      />
      <AnimatePresence initial={false}>
        {showLatest && (
          <motion.div
            key="latest"
            className="absolute left-1/2 z-10 -translate-x-1/2"
            style={{ bottom: bottomInset + 12 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <IconButton
              variant="secondary"
              icon={ArrowDown}
              label="Scroll to latest"
              onClick={() => {
                setFollowing(true);
                virtuoso.current?.scrollTo({
                  top: listHeight.current,
                  behavior: "smooth",
                });
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
