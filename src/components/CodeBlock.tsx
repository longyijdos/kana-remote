import { useEffect, useState } from "react";
import type { ThemedTokenWithVariants } from "shiki";
import { CopyButton } from "./CopyButton";

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [highlighted, setHighlighted] = useState<{
    code: string;
    tokens: ThemedTokenWithVariants[][];
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("shiki/bundle/web")
      .then(async ({ codeToTokensWithThemes, bundledLanguages }) => {
        const lang =
          language in bundledLanguages ? (language as keyof typeof bundledLanguages) : "text";
        const tokens = await codeToTokensWithThemes(code, {
          lang,
          themes: { light: "github-light", dark: "github-dark" },
        });
        if (!cancelled) setHighlighted({ code, tokens });
      })
      .catch(() => {
        /* Plain text remains usable if highlighting is unavailable. */
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language || "代码"}</span>
        <CopyButton value={code} />
      </div>
      <pre>
        <code>
          {highlighted?.code === code
            ? highlighted.tokens.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Lines are fixed positions in this code block.
                <span className="code-line" key={`line-${index}`}>
                  {line.map((token) => (
                    <span
                      key={token.offset}
                      style={
                        {
                          "--code-light": token.variants.light?.color,
                          "--code-dark": token.variants?.dark?.color,
                        } as React.CSSProperties
                      }
                    >
                      {token.content}
                    </span>
                  ))}
                  {index < highlighted.tokens.length - 1 ? "\n" : ""}
                </span>
              ))
            : code}
        </code>
      </pre>
    </div>
  );
}
