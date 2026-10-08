import { isValidElement, type ReactNode, useContext } from "react";
import { CodeBlock, StreamdownContext, useIsCodeFenceIncomplete } from "streamdown";
import { CopyButton } from "./CopyButton";

export function CodeCard({ children }: { children?: ReactNode }) {
  const incomplete = useIsCodeFenceIncomplete();
  const { isAnimating } = useContext(StreamdownContext);
  if (!isValidElement<{ children?: string; className?: string }>(children))
    return <pre>{children}</pre>;
  const code = String(children.props.children ?? "").replace(/\n$/, "");
  const language = /language-([^\s]+)/.exec(children.props.className ?? "")?.[1] ?? "";
  return (
    <CodeBlock
      code={code}
      language={language || "text"}
      isIncomplete={incomplete}
      lineNumbers={false}
    >
      <CopyButton value={code} label="Copy code" disabled={isAnimating} />
    </CodeBlock>
  );
}
