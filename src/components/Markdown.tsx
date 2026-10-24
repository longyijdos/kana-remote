import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { memo, useMemo, useSyncExternalStore } from "react";
import { type Components, type ControlsConfig, type MermaidOptions, Streamdown } from "streamdown";
import { CodeCard, MermaidFallback } from "./CodeCard";
import { normalizeMathDelimiters } from "./markdown-math";

const plugins = { code, cjk, math, mermaid };
const darkQuery = "(prefers-color-scheme: dark)";

function subscribeColorScheme(onChange: () => void) {
  const query = window.matchMedia(darkQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribeColorScheme,
    () => window.matchMedia(darkQuery).matches,
    () => false,
  );
}
const controls: ControlsConfig = {
  code: { copy: true, download: false },
  table: false,
  image: false,
  // Pan/zoom also drives auto-fit and the fullscreen viewer; inline diagrams are made
  // view-only in CSS so touch drags keep scrolling the transcript.
  mermaid: { download: false, copy: false, fullscreen: true, panZoom: true },
};
const components: Components = {
  // Streamdown's own wrapper caps table height and adds nested borders; scroll sideways only.
  table({ children }) {
    return (
      <div className="table-scroll" data-streamdown="table-wrapper">
        <table data-streamdown="table">{children}</table>
      </div>
    );
  },
  pre({ children }) {
    return <CodeCard>{children}</CodeCard>;
  },
  a({ children, href }) {
    if (href === "streamdown:incomplete-link") return <span>{children}</span>;
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
};

export const Markdown = memo(function Markdown({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const dark = usePrefersDark();
  const diagrams = useMemo<MermaidOptions>(
    () => ({
      config: {
        theme: dark ? "dark" : "neutral",
        fontFamily: "var(--ion-font-family)",
      },
      errorComponent: MermaidFallback,
    }),
    [dark],
  );
  return (
    <Streamdown
      // Streamdown caches its context, so remount to redraw diagrams in the new theme.
      key={dark ? "dark" : "light"}
      className="markdown min-w-0"
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      plugins={plugins}
      components={components}
      controls={controls}
      mermaid={diagrams}
      lineNumbers={false}
    >
      {normalizeMathDelimiters(text)}
    </Streamdown>
  );
});
