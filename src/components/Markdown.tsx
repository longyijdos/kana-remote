import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { memo } from "react";
import { type Components, type ControlsConfig, Streamdown } from "streamdown";
import { CodeCard } from "./CodeCard";
import { normalizeMathDelimiters } from "./markdown-math";

const plugins = { code, cjk, math };
const controls: ControlsConfig = {
  code: { copy: true, download: false },
  table: false,
  image: false,
  mermaid: false,
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
  return (
    <Streamdown
      className="markdown min-w-0"
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      plugins={plugins}
      components={components}
      controls={controls}
      lineNumbers={false}
    >
      {normalizeMathDelimiters(text)}
    </Streamdown>
  );
});
