import type { AssistantContent, AssistantMessage, ServerEvent, Snapshot } from "../api/types";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
type TextBlock = { graphemes: string[]; shown: number };
type Options = {
  onChange: (message: AssistantMessage | null) => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
};

// Only the visible text lags behind. Protocol state and non-text content stay live.
export class StreamingText {
  private target: AssistantMessage | null = null;
  private blocks = new Map<number, TextBlock>();
  private complete = false;
  private sessionId: string | null = null;
  private frame: number | null = null;
  private lastFrame: number | null = null;
  private readonly requestFrame: NonNullable<Options["requestFrame"]>;
  private readonly cancelFrame: NonNullable<Options["cancelFrame"]>;
  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
    this.requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));
  }

  receive(event: ServerEvent, snapshot: Snapshot | null): void {
    switch (event.type) {
      case "snapshot": {
        const saved = snapshot?.session?.messages.find((message) => message.id === this.target?.id);
        // A normal end-of-run resync must not cut short the final visible tail.
        if (
          this.complete &&
          snapshot?.session?.id === this.sessionId &&
          saved?.role === "assistant" &&
          saved.stopReason !== "aborted" &&
          saved.stopReason !== "error" &&
          snapshot.run?.outcome !== "aborted" &&
          snapshot.run?.outcome !== "error"
        ) {
          this.setTarget(saved);
          this.publish();
          this.schedule();
        } else {
          this.reset();
          if (snapshot?.assistant) {
            this.sessionId = snapshot.session?.id ?? null;
            this.setTarget(snapshot.assistant);
            this.catchUp();
          }
        }
        return;
      }
      case "session.changed":
      case "run.started":
      case "model_turn.started":
        this.reset();
        return;
      case "assistant.started":
        this.reset();
        this.sessionId = snapshot?.session?.id ?? null;
        if (snapshot?.assistant) {
          this.setTarget(snapshot.assistant);
          this.catchUp();
        }
        return;
      case "assistant.delta":
      case "assistant.content": {
        if (!snapshot?.assistant) return;
        if (!this.target) this.sessionId = snapshot.session?.id ?? null;
        this.setTarget(snapshot.assistant);
        const content = (event.data as { content?: AssistantContent }).content;
        if (
          event.type === "assistant.content" &&
          (content?.type === "tool_call" || content?.type === "hosted_tool")
        )
          this.catchUp();
        else {
          this.publish();
          this.schedule();
        }
        return;
      }
      case "assistant.completed": {
        const message = (event.data as { message: AssistantMessage }).message;
        this.setTarget(message);
        this.complete = true;
        if (
          message.stopReason === "toolUse" ||
          message.stopReason === "aborted" ||
          message.stopReason === "error"
        )
          this.reset();
        else {
          this.publish();
          this.schedule();
        }
        return;
      }
      case "run.completed":
        if (snapshot?.run?.outcome === "aborted" || snapshot?.run?.outcome === "error")
          this.reset();
        return;
      case "run.failed":
        this.reset();
        return;
      case "tool.started":
      case "approval.required":
      case "context.compaction_started":
        this.catchUp();
    }
  }

  catchUp(): void {
    this.clearFrame();
    for (const block of this.blocks.values()) block.shown = block.graphemes.length;
    this.publish();
  }

  reset(): void {
    this.clearFrame();
    this.target = null;
    this.blocks.clear();
    this.complete = false;
    this.sessionId = null;
    this.options.onChange(null);
  }

  private setTarget(message: AssistantMessage): void {
    if (this.target?.id !== message.id) {
      this.clearFrame();
      this.blocks.clear();
      this.complete = false;
    }
    this.target = message;
    const blocks = new Map<number, TextBlock>();
    for (const [index, content] of message.content.entries()) {
      if (content.type !== "text") continue;
      const graphemes = Array.from(segmenter.segment(content.text), (part) => part.segment);
      const previous = this.blocks.get(index);
      let shown = 0;
      while (previous && shown < previous.shown && graphemes[shown] === previous.graphemes[shown])
        shown++;
      blocks.set(index, { graphemes, shown });
    }
    this.blocks = blocks;
  }

  private pending(): number {
    let count = 0;
    for (const block of this.blocks.values()) count += block.graphemes.length - block.shown;
    return count;
  }

  private publish(): void {
    if (!this.target) return;
    if (this.complete && !this.pending()) {
      this.reset();
      return;
    }
    this.options.onChange({
      ...this.target,
      content: this.target.content.map((content, index) => {
        const block = this.blocks.get(index);
        return content.type === "text" && block
          ? { ...content, text: block.graphemes.slice(0, block.shown).join("") }
          : content;
      }),
    });
  }

  private schedule(): void {
    if (this.frame !== null || !this.pending()) return;
    this.frame = this.requestFrame((time) => {
      this.frame = null;
      const elapsed = this.lastFrame === null ? 16 : time - this.lastFrame;
      if (elapsed >= 16) {
        this.lastFrame = time - (elapsed % 16);
        // Same adaptive rate as the TUI: bounded acceleration for larger bursts.
        let budget = Math.min(
          12,
          Math.max(1, Math.ceil(this.pending() / 16)) + Number(this.complete),
        );
        for (const block of this.blocks.values()) {
          const count = Math.min(budget, block.graphemes.length - block.shown);
          block.shown += count;
          budget -= count;
          if (!budget) break;
        }
        this.publish();
      }
      this.schedule();
    });
  }

  private clearFrame(): void {
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    this.lastFrame = null;
  }
}
