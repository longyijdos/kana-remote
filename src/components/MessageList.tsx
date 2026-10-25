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
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  AssistantMessage,
  Snapshot,
  ToolResultMessage,
  ToolState,
  UserMessage,
} from "../api/types";
import { type TranscriptActivity, visibleMessages } from "../state/events";
import { describeUserMessage, type NoticeKind } from "../state/notices";
import { useClientStore } from "../state/store";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import { HostedToolRow, Images, ToolRow } from "./ToolRow";
import { IconButton } from "./ui";

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

function Activity({ activity }: { activity: TranscriptActivity | null }) {
  return (
    <AnimatePresence initial={false}>
      {activity && activity !== "prepared" && (
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
            {activity === "compacting" ? (
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
  );
}

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

// Rows only receive data that changes with their own content, so streaming text re-renders
// the message being written and memo skips every other row.
const MessageRow = memo(function MessageRow({
  message,
  tools,
  results,
  streaming,
}: {
  message: UserMessage | AssistantMessage;
  tools: ToolState[];
  results: ReadonlyMap<string, ToolResultMessage>;
  streaming: boolean;
}) {
  if (message.role === "user") return <UserRow message={message} />;
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
          const state = tools.find((item) => item.tool_call_id === content.id);
          const result = results.get(content.id);
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
        <div className="-ml-2 mt-1 flex items-center">
          <CopyButton
            value={text}
            label="Copy response"
            small
            className="text-muted-foreground/70"
          />
        </div>
      )}
    </article>
  );
});

const page = 60;
// How far from the bottom a reader must be before "Scroll to latest" appears.
const latestThreshold = 160;

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
  const sessionMessages = snapshot.session?.messages;
  const results = useMemo(() => {
    const map = new Map<string, ToolResultMessage>();
    for (const message of sessionMessages ?? [])
      if (message.role === "tool") map.set(message.toolCallId, message);
    return map;
  }, [sessionMessages]);
  const liveId = displayAssistant?.id ?? snapshot.assistant?.id;
  const [limit, setLimit] = useState(page);
  const rows = messages.length > limit ? messages.slice(-limit) : messages;
  const hidden = messages.length - rows.length;

  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const animating = useRef(false);
  const dragging = useRef(false);
  const lastTop = useRef(0);
  const touchY = useRef<number | null>(null);
  const lastOwnMessage = useRef<string | null | undefined>(undefined);
  const keepInPlace = useRef<{ row: Element; top: number } | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  // The button is for readers who are genuinely away from the latest message, not for
  // a nudge at the bottom or a list too short to scroll.
  const updateLatest = useCallback(() => {
    const element = scroller.current;
    const distance = element ? element.scrollHeight - element.scrollTop - element.clientHeight : 0;
    setShowLatest(!following.current && distance > latestThreshold);
  }, []);
  const setFollowing = useCallback(
    (value: boolean) => {
      if (!value) animating.current = false;
      // Back at the latest message, release any history the reader loaded.
      if (value) setLimit(page);
      if (following.current === value) return;
      following.current = value;
      updateLatest();
    },
    [updateLatest],
  );
  // Gestures on a list that cannot scroll are not reading history.
  const stopFollowing = useCallback(() => {
    const element = scroller.current;
    if (element && element.scrollHeight - element.clientHeight > 2) setFollowing(false);
  }, [setFollowing]);
  // Pin to the real bottom, including the spacer that reserves room for the composer.
  // A finger on the list holds pinning until the gesture is known; otherwise content that
  // grows during the touch slop pulls the list down just as a drag begins.
  const pin = useCallback(() => {
    const element = scroller.current;
    if (element && following.current && !animating.current && touchY.current === null)
      element.scrollTop = element.scrollHeight;
  }, []);
  useLayoutEffect(pin, [pin]);
  // Browsers skip scroll anchoring at offset 0, which is exactly where "Show earlier" sits,
  // so keep the previously first row where it was once older rows are inserted above it.
  // The inserted rows settle to content-visibility's remembered sizes over the next frames.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Runs after each window change.
  useLayoutEffect(() => {
    const element = scroller.current;
    const anchor = keepInPlace.current;
    keepInPlace.current = null;
    if (!element || !anchor) return;
    let frames = 4;
    let frame = 0;
    const settle = () => {
      const shift = anchor.row.getBoundingClientRect().top - anchor.top;
      if (Math.abs(shift) >= 1) element.scrollTop += shift;
      if (--frames > 0) frame = requestAnimationFrame(settle);
    };
    settle();
    return () => cancelAnimationFrame(frame);
  }, [limit]);
  // Rows, the activity indicator and the composer inset all change height without scrolling.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !content.current) return;
    const observer = new ResizeObserver(() => {
      pin();
      updateLatest();
    });
    observer.observe(element);
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [pin, updateLatest]);
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
      <div
        ref={scroller}
        data-transcript=""
        className="ion-content-scroll-host h-full overflow-y-auto overflow-x-hidden overscroll-contain"
        // Only the user's own gestures stop following; content growth and the browser's own
        // scroll adjustments must not count as reading history.
        onWheelCapture={(event) => {
          if (event.deltaY < 0) stopFollowing();
        }}
        onTouchStartCapture={(event) => {
          touchY.current = event.touches[0].clientY;
        }}
        onTouchMoveCapture={(event) => {
          const y = event.touches[0].clientY;
          if (touchY.current !== null && y > touchY.current) stopFollowing();
          touchY.current = y;
        }}
        onTouchEndCapture={(event) => {
          if (event.touches.length) return;
          touchY.current = null;
          pin();
        }}
        onTouchCancelCapture={() => {
          touchY.current = null;
          pin();
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
            stopFollowing();
        }}
        onScroll={(event) => {
          const element = event.currentTarget;
          const top = element.scrollTop;
          const distance = element.scrollHeight - top - element.clientHeight;
          // Resume only when moving down onto the bottom: smooth wheel scrolling starts with
          // tiny upward steps that are still within reach of the bottom.
          if (dragging.current && top < lastTop.current) stopFollowing();
          else if (distance <= 2 && top >= lastTop.current) {
            animating.current = false;
            setFollowing(true);
          }
          lastTop.current = top;
          updateLatest();
        }}
      >
        <div ref={content}>
          {hidden > 0 && (
            <div className="flex justify-center pb-2 pt-4">
              <button
                type="button"
                className="rounded-full bg-muted/70 px-4 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
                onClick={() => {
                  const row = content.current?.querySelector(".transcript-row");
                  if (row) keepInPlace.current = { row, top: row.getBoundingClientRect().top };
                  setFollowing(false);
                  setLimit((value) => value + page);
                }}
              >
                Show earlier messages
              </button>
            </div>
          )}
          {rows.map((message) => (
            <div key={message.id} className="transcript-row">
              <MessageRow
                message={message}
                tools={snapshot.tools}
                results={results}
                streaming={message.id === liveId}
              />
            </div>
          ))}
          <Activity activity={activity} />
          <div style={{ height: bottomInset }} aria-hidden="true" />
        </div>
      </div>
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
