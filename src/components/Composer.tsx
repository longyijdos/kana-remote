import { ArrowUp, CalendarClock, Square } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "./ui";

// Desktop keyboards send on Enter; touch keyboards keep Enter for new lines.
const enterSends = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  onAgenda,
  active,
  pending,
  canSend,
  canStop,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onAgenda: () => void;
  active: boolean;
  pending: boolean;
  canSend: boolean;
  canStop: boolean;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [height, setHeight] = useState(40);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();
  // A draft keeps the composer open so tapping Send never chases a collapsing button.
  const expanded = focused || value.length > 0;
  const layout = { duration: reducedMotion ? 0 : 0.28, ease: [0.32, 0.72, 0, 1] } as const;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Measure the DOM after each controlled text change.
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    const previousHeight = element.style.height;
    element.style.height = "40px";
    const nextHeight = Math.min(Math.max(element.scrollHeight, 40), 112);
    element.style.height = previousHeight;
    setHeight(nextHeight);
  }, [value]);

  return (
    <motion.form
      layout
      transition={{ layout }}
      // One set of controls moves between a single row and a text-over-actions layout.
      style={{
        borderRadius: expanded ? 24 : 28,
        gridTemplateAreas: expanded ? '"text text text" "lead . send"' : '"lead text send"',
      }}
      className={`composer-card grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1 p-2 ${
        expanded ? "mx-0 gap-y-1 pt-3" : "mx-6"
      }`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) textarea.current?.focus();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <motion.div layout="position" transition={{ layout }} style={{ gridArea: "lead" }}>
        <IconButton icon={CalendarClock} label="Agenda" onClick={onAgenda} />
      </motion.div>
      <motion.div
        layout="position"
        transition={{ layout }}
        className={`flex min-w-0 ${expanded ? "px-3" : "px-1"}`}
        style={{ gridArea: "text" }}
      >
        <motion.textarea
          ref={textarea}
          initial={false}
          animate={{ height }}
          className="composer-textarea block min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-2 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Message"
          placeholder="Talk to Kana"
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          // Only the message field counts: the Agenda button and its sheet must not expand it.
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            // Enter that confirms an IME candidate; Safari reports it as keyCode 229.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (!(event.ctrlKey || event.metaKey || enterSends)) return;
            event.preventDefault();
            if (canSend) onSend();
          }}
        />
      </motion.div>
      <motion.div layout="position" transition={{ layout }} style={{ gridArea: "send" }}>
        <IconButton
          type={active ? "button" : "submit"}
          variant="primary"
          icon={active ? Square : ArrowUp}
          label={active ? "Stop" : "Send"}
          busy={pending}
          disabled={active ? !canStop : !canSend}
          // Keep the keyboard up: the button must not take focus from the message field.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (active && canStop) onStop();
          }}
        />
      </motion.div>
    </motion.form>
  );
}
