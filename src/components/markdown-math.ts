// Kana's TUI accepts $…$, $$…$$, \(…\) and \[…\]. remark-math is left at its default (only
// $$ is math) and prose is rewritten to that form before parsing: single-dollar spans are
// accepted with the TUI's ambiguity rules so prices and shell variables stay literal.

const fence = /^ {0,3}(`{3,}|~{3,})/;
const inlineCode = /(`+)[\s\S]*?\1/g;
const displayLine = /^(\s*)\$\$(.+)\$\$\s*$/;

// Ported from the TUI's isAmbiguousDollarMath.
function isAmbiguousDollarMath(text: string, trailing: string): boolean {
  return (
    /\s$/.test(text) ||
    /^\d/.test(trailing) ||
    (/^[A-Z_][A-Z0-9_]*(?:[^A-Za-z0-9_\s])?$/.test(text) &&
      /^[A-Za-z_][A-Za-z0-9_]*/.test(trailing)) ||
    text.includes("`")
  );
}

function closingDollar(text: string, from: number): number {
  for (let index = from; index < text.length; index++) {
    if (text[index] === "\\") index++;
    else if (text[index] === "$") return index;
    else if (text.startsWith("\n\n", index)) return -1;
  }
  return -1;
}

function convertMath(text: string): string {
  let output = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\" && (text[index + 1] === "(" || text[index + 1] === "[")) {
      const block = text[index + 1] === "[";
      const end = text.indexOf(block ? "\\]" : "\\)", index + 2);
      if (end >= 0) {
        const tex = text.slice(index + 2, end).trim();
        output += block ? `\n$$\n${tex}\n$$\n` : `$$${tex}$$`;
        index = end + 2;
        continue;
      }
    }
    if (char === "\\") {
      output += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char === "$" && text[index + 1] === "$") {
      const end = text.indexOf("$$", index + 2);
      const stop = end < 0 ? text.length : end + 2;
      output += text.slice(index, stop);
      index = stop;
      continue;
    }
    if (char === "$" && text[index + 1] !== undefined && !/\s/.test(text[index + 1])) {
      const end = closingDollar(text, index + 1);
      const tex = end < 0 ? "" : text.slice(index + 1, end);
      if (end >= 0 && !isAmbiguousDollarMath(tex, text.slice(end + 1))) {
        output += `$$${tex}$$`;
        index = end + 1;
        continue;
      }
    }
    output += char;
    index++;
  }
  return output;
}

function convertProse(prose: string): string {
  const codes: string[] = [];
  const protectedProse = prose
    .replace(inlineCode, (code) => `\uE000${codes.push(code) - 1}\uE000`)
    .split("\n")
    .map((line) =>
      line.replace(
        displayLine,
        (_match, indent: string, tex: string) => `${indent}$$\n${indent}${tex.trim()}\n${indent}$$`,
      ),
    )
    .join("\n");
  return convertMath(protectedProse).replace(
    /\uE000(\d+)\uE000/g,
    (_match, index: string) => codes[Number(index)],
  );
}

export function normalizeMathDelimiters(markdown: string): string {
  if (!markdown.includes("$") && !markdown.includes("\\(") && !markdown.includes("\\["))
    return markdown;
  const output: string[] = [];
  let prose: string[] = [];
  let closing: string | null = null;
  const flush = () => {
    if (prose.length) output.push(convertProse(prose.join("\n")));
    prose = [];
  };
  for (const line of markdown.split("\n")) {
    const marker = fence.exec(line)?.[1];
    if (closing === null && marker) {
      flush();
      closing = marker;
      output.push(line);
    } else if (closing !== null) {
      output.push(line);
      if (marker?.[0] === closing[0] && marker.length >= closing.length) closing = null;
    } else prose.push(line);
  }
  flush();
  return output.join("\n");
}
