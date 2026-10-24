import {
  AlarmClock,
  ArrowDown,
  Bot,
  ClipboardCheck,
  Clock,
  FoldVertical,
  type LucideIcon,
  RotateCcw,
  SquareTerminal,
  Target,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import type { AssistantMessage, Snapshot, UserMessage } from "../api/types";
import { type TranscriptActivity, visibleMessages } from "../state/events";
import { describeUserMessage, type NoticeKind } from "../state/notices";
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

const noticeIcons: Record<NoticeKind, LucideIcon> = {
  wake: AlarmClock,
  job: SquareTerminal,
  subagent: Bot,
  task: ClipboardCheck,
  goal: Target,
  recovery: RotateCcw,
  compaction: FoldVertical,
};

function Notice({ notice, label, detail }: { notice: NoticeKind; label: string; detail?: string }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = noticeIcons[notice];
  // Wakes carry Kana's own note, which is the point of the notice; others hide bulky detail.
  const inline = notice === "wake" ? detail : undefined;
  const expandable = Boolean(detail) && !inline;
  const content = (
    <>
      <span className="flex items-center justify-center gap-1.5">
        <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="font-medium">{label}</span>
      </span>
      {inline && (
        <span className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-center">
          {inline}
        </span>
      )}
    </>
  );
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col items-center px-8 py-3 sm:px-6">
      {expandable ? (
        <button
          type="button"
          className="flex max-w-full flex-col rounded-lg bg-transparent px-2 py-1 text-[13px] leading-5 text-muted-foreground transition-colors hover:bg-muted/60 motion-reduce:transition-none"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {content}
        </button>
      ) : (
        <div className="flex max-w-full flex-col px-2 py-1 text-[13px] leading-5 text-muted-foreground">
          {content}
        </div>
      )}
      {expandable && expanded && (
        <div className="mt-2 max-h-72 w-full overflow-auto rounded-xl bg-muted/60 px-4 py-3 text-sm leading-6 whitespace-pre-wrap break-words select-text">
          {detail}
        </div>
      )}
    </article>
  );
}

function UserRow({ message }: { message: UserMessage }) {
  const entry = describeUserMessage(message);
  if (entry.kind === "notice")
    return <Notice notice={entry.notice} label={entry.label} detail={entry.detail} />;
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col items-end px-5 py-3 sm:px-6">
      {entry.scheduled && (
        <span className="mb-1 flex items-center gap-1 pr-1 text-xs text-muted-foreground">
          <Clock className="size-3" strokeWidth={2} aria-hidden="true" />
          Scheduled
        </span>
      )}
      <div className="max-w-[88%] rounded-2xl bg-muted px-4 py-3 text-base leading-7">
        <div className="whitespace-pre-wrap break-words select-text">{entry.text}</div>
        <Images images={message.images} />
      </div>
    </article>
  );
}

const MessageRow = memo(function MessageRow({
  message,
  snapshot,
  streaming,
}: {
  message: UserMessage | AssistantMessage;
  snapshot: Snapshot;
  streaming: boolean;
}) {
  if (message.role === "user") return <UserRow message={message} />;
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
  const scroller = useRef<HTMLElement | null>(null);
  const following = useRef(true);
  const animating = useRef(false);
  const dragging = useRef(false);
  const lastTop = useRef(0);
  const touchY = useRef<number | null>(null);
  const lastOwnMessage = useRef<string | null | undefined>(undefined);
  const [showLatest, setShowLatest] = useState(false);
  const setFollowing = useCallback((value: boolean) => {
    if (!value) animating.current = false;
    if (following.current === value) return;
    following.current = value;
    setShowLatest(!value);
  }, []);
  // Pin to the real bottom, including the footer that reserves room for the composer.
  const pin = useCallback(() => {
    const element = scroller.current;
    if (element && following.current && !animating.current)
      element.scrollTop = element.scrollHeight;
  }, []);
  // Rows, the activity footer and the composer inset all change height without scrolling.
  // Virtuoso's viewport is fixed at 100%, so watch the item list and footer inside it.
  useEffect(() => {
    const element = scroller.current;
    const viewport = element?.firstElementChild;
    if (!element || !viewport) return;
    const observer = new ResizeObserver(pin);
    observer.observe(element);
    for (const child of viewport.children) observer.observe(child);
    return () => observer.disconnect();
  }, [pin]);
  useEffect(() => {
    const release = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);
  useEffect(() => {
    const own =
      messages.findLast(
        (message) => message.role === "user" && message.provenance.kind === "user_input",
      )?.id ?? null;
    if (lastOwnMessage.current !== undefined && own !== lastOwnMessage.current) {
      setFollowing(true);
      pin();
    }
    lastOwnMessage.current = own;
  }, [messages, pin, setFollowing]);
  return (
    <div className="relative min-h-0 flex-1">
      <Virtuoso
        scrollerRef={(element) => {
          scroller.current = element instanceof HTMLElement ? element : null;
        }}
        data={messages}
        context={context}
        components={listComponents}
        className="ion-content-scroll-host h-full overflow-x-hidden"
        initialTopMostItemIndex={
          messages.length ? { index: messages.length - 1, align: "end" } : undefined
        }
        // Only the user's own gestures stop following; the list also scrolls itself while it
        // measures rows, and those programmatic moves must not count as reading history.
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
        onPointerDownCapture={(event) => {
          if (event.target === event.currentTarget) dragging.current = true;
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
          const element = event.currentTarget;
          if (event.target !== element) return;
          const top = element.scrollTop;
          const distance = element.scrollHeight - top - element.clientHeight;
          // Resume only when moving down onto the bottom: smooth wheel scrolling starts with
          // tiny upward steps that are still within reach of the bottom.
          if (dragging.current && top < lastTop.current) setFollowing(false);
          else if (distance <= 2 && top >= lastTop.current) {
            animating.current = false;
            setFollowing(true);
          }
          lastTop.current = top;
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
                const element = scroller.current;
                if (!element) return;
                setFollowing(true);
                animating.current = true;
                element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
                // Streaming keeps moving the bottom, so the smooth target goes stale; settle on
                // the real bottom once the animation has had time to run.
                window.setTimeout(() => {
                  animating.current = false;
                  pin();
                }, 400);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
