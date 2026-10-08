import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { memo } from "react";
import { type Components, type ControlsConfig, Streamdown } from "streamdown";
import { CodeCard } from "./CodeCard";

const plugins = { code, cjk };
const controls: ControlsConfig = {
  code: { copy: true, download: false },
  table: false,
  image: false,
  mermaid: false,
};
const components: Components = {
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
      {text}
    </Streamdown>
  );
});
