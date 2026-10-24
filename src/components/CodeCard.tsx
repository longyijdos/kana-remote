import { cloneElement, isValidElement, type ReactNode, useContext } from "react";
import {
  CodeBlock,
  type MermaidErrorComponentProps,
  StreamdownContext,
  useIsCodeFenceIncomplete,
} from "streamdown";
import { CopyButton } from "./CopyButton";

function SourceBlock({
  code,
  language,
  incomplete = false,
}: {
  code: string;
  language: string;
  incomplete?: boolean;
}) {
  const { isAnimating } = useContext(StreamdownContext);
  return (
    <CodeBlock code={code} language={language} isIncomplete={incomplete} lineNumbers={false}>
      <CopyButton value={code} label="Copy code" small disabled={isAnimating} />
    </CodeBlock>
  );
}

export function CodeCard({ children }: { children?: ReactNode }) {
  const incomplete = useIsCodeFenceIncomplete();
  if (!isValidElement<{ children?: string; className?: string }>(children))
    return <pre>{children}</pre>;
  const code = String(children.props.children ?? "").replace(/\n$/, "");
  const language = /language-([^\s]+)/.exec(children.props.className ?? "")?.[1] ?? "";
  // Streamdown's own code renderer draws Mermaid once its default pre marks the code as a
  // block; a half-streamed diagram stays as source so unfinished input never flashes errors.
  if (language === "mermaid" && !incomplete)
    return cloneElement(children, { "data-block": "true" } as Record<string, string>);
  return <SourceBlock code={code} language={language || "text"} incomplete={incomplete} />;
}

// Rendered inside Streamdown's diagram frame, so it shows the source plainly.
export function MermaidFallback({ chart }: MermaidErrorComponentProps) {
  return (
    <div className="px-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Couldn't render this diagram.</span>
        <CopyButton value={chart} label="Copy diagram source" small />
      </div>
      <pre className="m-0 overflow-x-auto pb-1 font-mono text-[13px] leading-5 select-text">
        {chart}
      </pre>
    </div>
  );
}
