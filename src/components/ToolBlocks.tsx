import { Check, Circle, CircleDot, File, Folder } from "lucide-react";
import { useState } from "react";
import type { DiffRow, TodoItem, ToolBlock } from "../tools/describe";
import { formatBytes } from "../tools/describe";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";

const todoIcons = {
  pending: Circle,
  in_progress: CircleDot,
  completed: Check,
};

const mono = "font-mono text-[13px] leading-5";
const scroll = "overflow-auto overscroll-contain select-text";

function Label({ text, copy }: { text: string; copy?: string }) {
  return (
    <div className="flex min-h-8 items-center justify-between text-xs text-muted-foreground">
      <span>{text}</span>
      {copy !== undefined && <CopyButton value={copy} small />}
    </div>
  );
}

function CatalogItem({ name, description }: { name: string; description: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="py-2">
      <div className="font-mono text-[13px] leading-5 break-all select-text">{name}</div>
      {description && (
        <button
          type="button"
          aria-expanded={expanded}
          className={`mt-0.5 w-full bg-transparent p-0 text-left text-[13px] leading-5 text-muted-foreground break-words ${expanded ? "block select-text" : "line-clamp-2"}`}
          onClick={() => setExpanded(!expanded)}
        >
          {description}
        </button>
      )}
    </li>
  );
}

function Todos({ items }: { items: TodoItem[] }) {
  if (!items.length) return <p className="m-0 py-1 text-sm text-muted-foreground">No todos.</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 py-1.5 text-sm">
      {items.map((item, index) => {
        const Icon = todoIcons[item.status];
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: Todo items have no identity.
            key={index}
            className={`flex gap-2.5 ${item.status === "completed" ? "text-muted-foreground line-through" : ""}`}
          >
            <Icon
              className={`mt-[3px] size-3.5 shrink-0 ${item.status === "in_progress" ? "text-foreground" : "text-muted-foreground"}`}
              strokeWidth={2}
              aria-label={item.status.replace("_", " ")}
            />
            <span className="min-w-0 break-words">{item.content}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Code with a line-number gutter; the gutter is excluded from text selection. */
function NumberedLines({
  rows,
  maxHeight,
}: {
  rows: { number?: number | string; text: string; className?: string }[];
  maxHeight: string;
}) {
  const width = Math.max(...rows.map((row) => String(row.number ?? "").length), 1);
  return (
    <div className={`${mono} ${scroll} ${maxHeight}`}>
      <div className="min-w-max">
        {rows.map((row, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: Rows are positional.
            key={index}
            className={`flex ${row.className ?? ""}`}
          >
            <span
              className="shrink-0 select-none pr-3 text-right text-muted-foreground/60 tabular-nums"
              style={{ width: `calc(${width}ch + 0.75rem)` }}
              aria-hidden="true"
            >
              {row.number}
            </span>
            <span className="whitespace-pre pr-2">{row.text || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const diffStyles: Record<DiffRow["type"], { sign: string; className: string }> = {
  context: { sign: "", className: "text-muted-foreground" },
  added: { sign: "+", className: "diff-added" },
  removed: { sign: "−", className: "diff-removed" },
};

function Block({ block, maxHeight }: { block: ToolBlock; maxHeight: string }) {
  switch (block.kind) {
    case "terminal":
      return (
        <div className="relative pt-1.5">
          <div className="absolute -right-2 top-0">
            <CopyButton value={block.command} label="Copy command" small />
          </div>
          <div className={`${mono} ${scroll} ${maxHeight} pr-8`}>
            <div className="flex gap-2 whitespace-pre-wrap break-words">
              <span className="select-none text-muted-foreground" aria-hidden="true">
                $
              </span>
              <span className="min-w-0 font-medium">{block.command}</span>
            </div>
            {block.output !== undefined && (
              <div className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
                {block.output}
              </div>
            )}
          </div>
        </div>
      );
    case "text":
      return (
        <div>
          <Label text={block.label} />
          <p
            className={`m-0 whitespace-pre-wrap break-words text-sm leading-6 ${scroll} ${maxHeight}`}
          >
            {block.text}
          </p>
        </div>
      );
    case "markdown":
      return (
        <div>
          <Label text={block.label} copy={block.text} />
          <div className={`tool-markdown ${scroll} ${maxHeight}`}>
            <Markdown text={block.text} />
          </div>
        </div>
      );
    case "code":
      return (
        <div>
          <Label text={block.label} copy={block.text} />
          <pre className={`m-0 whitespace-pre-wrap break-words ${mono} ${scroll} ${maxHeight}`}>
            {block.text}
          </pre>
        </div>
      );
    case "lines":
      return (
        <div>
          <Label text={block.label} copy={block.lines.join("\n")} />
          <NumberedLines
            maxHeight={maxHeight}
            rows={block.lines.map((text, index) => ({ number: block.start + index, text }))}
          />
        </div>
      );
    case "diff":
      return (
        <div>
          <Label
            text={block.label}
            copy={block.rows
              .filter((row) => row.type !== "removed")
              .map((row) => row.text)
              .join("\n")}
          />
          <NumberedLines
            maxHeight={maxHeight}
            rows={block.rows.map((row) => ({
              number: diffStyles[row.type].sign,
              text: row.text,
              className: diffStyles[row.type].className,
            }))}
          />
        </div>
      );
    case "matches":
      return (
        <div className={`${scroll} ${maxHeight} space-y-2 py-1.5`}>
          {block.groups.map((group, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: A path can repeat in non-adjacent groups.
            <div key={index}>
              <div className="mb-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <File className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                <span className="truncate font-mono">{group.path}</span>
              </div>
              <NumberedLines
                maxHeight=""
                rows={group.rows.map((row) => ({ number: row.line, text: row.text }))}
              />
            </div>
          ))}
          {block.truncated && (
            <p className="m-0 text-xs text-muted-foreground">More matches omitted.</p>
          )}
        </div>
      );
    case "files":
      return (
        <div className={`${scroll} ${maxHeight} py-1.5`}>
          <ul className="m-0 list-none p-0 text-[13px] leading-6">
            {block.entries.map((entry) => {
              const Icon = entry.directory ? Folder : File;
              return (
                <li key={entry.name} className="flex items-center gap-2">
                  <Icon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {entry.name}
                    {entry.directory ? "/" : ""}
                  </span>
                  {entry.size !== undefined && (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatBytes(entry.size)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {block.truncated && (
            <p className="m-0 text-xs text-muted-foreground">More entries omitted.</p>
          )}
        </div>
      );
    case "fields":
      return (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 py-1.5 text-[13px] leading-5">
          {block.rows.map(([label, value], index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Labels repeat, e.g. job statuses.
            <div key={index} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="m-0 break-words select-text font-mono">{value}</dd>
            </div>
          ))}
        </dl>
      );
    case "catalog":
      return (
        <div className={`${scroll} ${maxHeight} py-0.5`}>
          <ul className="m-0 list-none divide-y divide-border p-0">
            {block.items.map((item) => (
              <CatalogItem key={item.name} name={item.name} description={item.description} />
            ))}
          </ul>
          {block.truncated && (
            <p className="m-0 pb-1.5 text-xs text-muted-foreground">More tools available.</p>
          )}
        </div>
      );
    case "todos":
      return <Todos items={block.items} />;
    case "error":
      return (
        <pre
          className={`m-0 whitespace-pre-wrap break-words py-1.5 ${mono} ${scroll} ${maxHeight} text-rose-600 dark:text-rose-400`}
        >
          {block.text}
        </pre>
      );
  }
}

export function ToolBlocks({
  blocks,
  maxHeight = "max-h-72",
}: {
  blocks: ToolBlock[];
  maxHeight?: string;
}) {
  return blocks.map((block, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: Blocks are derived and positional.
    <Block key={index} block={block} maxHeight={maxHeight} />
  ));
}
