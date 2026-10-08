import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../src/components/Markdown";

function render(text: string, streaming = false) {
  return renderToStaticMarkup(<Markdown text={text} streaming={streaming} />);
}

describe("Markdown rendering", () => {
  test("formats incomplete streaming emphasis without repairing completed messages", () => {
    expect(render("Before **bold", true)).toMatch(/data-streamdown="strong">bold<\/span>/);
    expect(render("Before **bold")).not.toContain('data-streamdown="strong"');
  });

  test("keeps incomplete links inactive and opens complete links directly", () => {
    const partial = render("Read [the docs", true);
    expect(partial).toContain("the docs");
    expect(partial).not.toContain('href="streamdown:');
    const complete = render("Read [the docs](https://example.com/docs)");
    expect(complete).toContain('href="https://example.com/docs"');
    expect(complete).toContain('target="_blank"');
  });

  test("renders GFM tables and emphasis adjacent to Chinese punctuation", () => {
    const html = render(
      "**中文文本（带括号）。**这句子继续。\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
    );
    expect(html).toMatch(/data-streamdown="strong">中文文本（带括号）。<\/span>/);
    expect(html).toContain("<table");
    expect(html).toMatch(/<td\b[^>]*>1<\/td>/);
  });

  test("sanitizes raw HTML and unsafe link protocols", () => {
    const html = render(
      '[bad](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">',
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  test("keeps fenced code escaped and provides one copy action that pauses during streaming", () => {
    const markdown = "```html\n<div>sample</div>\n```";
    const html = render(markdown);
    expect(html).toContain("&lt;div&gt;sample&lt;/div&gt;");
    expect(html.match(/data-streamdown="code-block"/g)).toHaveLength(1);
    expect(html.match(/data-streamdown="code-block-header"/g)).toHaveLength(1);
    expect(html.match(/>html<\/span>/g)).toHaveLength(1);
    expect(html).not.toContain("surface-card");
    expect(html.match(/aria-label="Copy code"/g)).toHaveLength(1);
    const button = render(markdown, true)
      .match(/<button\b[^>]*>/g)
      ?.find((element) => element.includes('aria-label="Copy code"'));
    expect(button).toContain('disabled=""');
  });
});
