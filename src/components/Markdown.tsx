import { isValidElement, memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

const components: Components = {
  pre({ children }) {
    if (isValidElement<{ children?: string; className?: string }>(children)) {
      const code = String(children.props.children ?? "").replace(/\n$/, "");
      const language = /language-([^\s]+)/.exec(children.props.className ?? "")?.[1] ?? "";
      return <CodeBlock code={code} language={language} />;
    }
    return <pre>{children}</pre>;
  },
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="table-scroll">
        <table>{children}</table>
      </div>
    );
  },
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
