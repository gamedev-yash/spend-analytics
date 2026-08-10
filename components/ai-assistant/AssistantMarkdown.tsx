"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Minimal, dependency-free renderer for the subset of Markdown the assistant
// system prompts actually produce: **bold**, *italic*, `code`, "- "/"1. "
// lists, and GitHub-flavored "| a | b |" tables — never headers, images, or
// blockquotes (the prompts explicitly tell the model to avoid those).
//
// Written by hand instead of pulling in react-markdown: the grammar surface
// the model uses is small and fixed, so a few dozen lines here avoids a new
// dependency. This is also the fix for newlines vanishing — rendering
// `{m.content}` as a plain text node lets the browser's default
// `white-space: normal` collapse every "\n" into a space, which is why a
// reply with paragraphs and a table used to arrive as one run-on line.

type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] };

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|") && line.includes("|", line.indexOf("|") + 1);
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && /^[\s|:-]+$/.test(t) && t.includes("-");
}

function isListItem(line: string): { ordered: boolean; text: string } | null {
  const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
  if (bullet) return { ordered: false, text: bullet[1] };
  const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
  if (numbered) return { ordered: true, text: numbered[1] };
  return null;
}

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Table: a "| a | b |" row immediately followed by a "|---|---|" separator.
    if (isTableRow(line) && lines[i + 1] !== undefined && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // List: consecutive "- " / "1. " lines.
    const firstItem = isListItem(line);
    if (firstItem) {
      const ordered = firstItem.ordered;
      const items: string[] = [firstItem.text];
      i += 1;
      while (i < lines.length) {
        const next = isListItem(lines[i]);
        if (!next) break;
        items.push(next.text);
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph: consecutive plain lines, stopping before a list or table starts.
    const paraLines: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isListItem(lines[i]) &&
      !(isTableRow(lines[i]) && lines[i + 1] !== undefined && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", lines: paraLines });
  }

  return blocks;
}

/** Inline **bold** / *italic* / `code` — one level, no nesting, matching what the prompts produce. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*.+?\*\*|`.+?`|\*.+?\*)/g);
  return parts.filter((p) => p !== "").map((part, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function AssistantMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);

  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, i) => {
        const key = `b${i}`;

        if (block.type === "paragraph") {
          return (
            <p key={key} className="leading-relaxed text-[0.925rem]">
              {block.lines.map((line, li) => (
                <Fragment key={li}>
                  {li > 0 && <br />}
                  {renderInline(line, `${key}-${li}`)}
                </Fragment>
              ))}
            </p>
          );
        }

        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag
              key={key}
              className={cn(
                "space-y-1.5 pl-5 text-[0.925rem] leading-relaxed marker:text-slate-400 dark:marker:text-slate-500",
                block.ordered ? "list-decimal" : "list-disc"
              )}
            >
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInline(item, `${key}-${ii}`)}</li>
              ))}
            </Tag>
          );
        }

        return (
          <div key={key} className="overflow-hidden overflow-x-auto rounded-lg border border-slate-200 shadow-sm dark:border-slate-700">
            <table className="w-full min-w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80">
                <tr>
                  {block.header.map((cell, ci) => (
                    <th
                      key={ci}
                      className="whitespace-nowrap px-3 py-2 font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
                      style={{ fontSize: "0.7rem" }}
                    >
                      {renderInline(cell, `${key}-h${ci}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {block.rows.map((row, ri) => (
                  <tr key={ri} className="transition-colors even:bg-slate-50/70 hover:bg-slate-100/80 dark:even:bg-slate-800/30 dark:hover:bg-slate-800/60">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={cn(
                          "whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300",
                          ci === 0 && "font-medium text-slate-800 dark:text-slate-100"
                        )}
                      >
                        {renderInline(cell, `${key}-r${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
