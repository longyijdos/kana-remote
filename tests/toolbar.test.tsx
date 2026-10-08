import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Snapshot } from "../src/api/types";
import { Toolbar } from "../src/components/Toolbar";

function render(context: Snapshot["context"]) {
  return renderToStaticMarkup(
    <Toolbar
      status="Idle"
      context={context}
      disabled={false}
      onSessions={() => {}}
      onSettings={() => {}}
    />,
  );
}

describe("toolbar context remaining", () => {
  test.each([
    [0, 100],
    [28_000, 72],
    [28_600, 71],
    [125_000, 0],
  ])("shows remaining context for %i tokens as %i percent", (tokens, remaining) => {
    const html = render({ estimated_tokens: tokens, context_limit: 100_000 });
    expect(html).toContain(`>${remaining}%</span>`);
  });

  test("hides the percentage when estimates are absent or unavailable", () => {
    for (const context of [
      undefined,
      { estimated_tokens: null, context_limit: 100_000 },
      { estimated_tokens: 100, context_limit: 0 },
    ]) {
      expect(render(context)).not.toContain('title="Context remaining"');
    }
  });
});
