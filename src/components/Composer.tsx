import { arrowUpOutline, stopOutline } from "ionicons/icons";
import { useLayoutEffect, useRef } from "react";
import { IconButton } from "./ui";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  active,
  pending,
  canSend,
  canStop,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  active: boolean;
  pending: boolean;
  canSend: boolean;
  canStop: boolean;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Measure the DOM after each controlled text change.
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "40px";
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 40), 112)}px`;
  }, [value]);

  return (
    <form
      className="composer-card flex items-end gap-3 p-3 pl-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) textarea.current?.focus();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <textarea
        ref={textarea}
        className="composer-textarea block min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-2 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground"
        aria-label="Message"
        placeholder="Talk to Kana"
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && canSend) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <IconButton
        type={active ? "button" : "submit"}
        variant="primary"
        icon={active ? stopOutline : arrowUpOutline}
        label={active ? "Stop" : "Send"}
        busy={pending}
        disabled={active ? !canStop : !canSend}
        onClick={() => {
          if (active && canStop) onStop();
        }}
      />
    </form>
  );
}
