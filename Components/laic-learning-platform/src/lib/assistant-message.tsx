import type { ReactNode } from "react";

/** Inline **bold** only — safe for user and assistant text. */
export function inlineBold(text: string): ReactNode[] {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

function stripHeadingMarks(line: string): string {
  return line.replace(/^#{1,6}\s+/, "").trim();
}

function isListLine(line: string): boolean {
  const t = line.trim();
  return /^[-*•]\s+/.test(t) || /^✅\s+/.test(t) || /^\d+\.\s+/.test(t);
}

function listItemText(line: string): string {
  return line
    .trim()
    .replace(/^[-*•]\s+/, "")
    .replace(/^✅\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
}

/** Turn model markdown into logical blocks for chat UI. */
export function parseAssistantMarkdown(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let listItems: string[] = [];
  let paraLines: string[] = [];

  const flushPara = () => {
    const text = paraLines.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paraLines = [];
  };

  const flushList = () => {
    if (listItems.length) blocks.push({ type: "list", items: [...listItems] });
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      flushPara();
      flushList();
      blocks.push({ type: "heading", text: stripHeadingMarks(trimmed) });
      continue;
    }

    if (isListLine(trimmed)) {
      flushPara();
      listItems.push(listItemText(trimmed));
      continue;
    }

    flushList();
    paraLines.push(trimmed);
  }

  flushPara();
  flushList();
  return blocks;
}

export function AssistantMessageBody({
  text,
  className = "",
  compact = false,
}: {
  text: string;
  className?: string;
  /** Tighter spacing for floating chat bubble */
  compact?: boolean;
}) {
  const blocks = parseAssistantMarkdown(text);
  const heading = compact ? "text-[13px] font-semibold mt-2 first:mt-0 mb-0.5" : "text-sm font-semibold mt-3 first:mt-0 mb-1";
  const para = compact ? "text-[13px] leading-relaxed my-1" : "text-sm leading-relaxed my-1.5";
  const list = compact ? "text-[13px] leading-relaxed my-1.5 pl-4 space-y-1 list-disc" : "text-sm leading-relaxed my-2 pl-4 space-y-1 list-disc";

  if (blocks.length === 0) {
    return <p className={para}>{inlineBold(text)}</p>;
  }

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <p key={i} className={heading}>
              {inlineBold(block.text)}
            </p>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className={list}>
              {block.items.map((item, j) => (
                <li key={j}>{inlineBold(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className={para}>
            {inlineBold(block.text)}
          </p>
        );
      })}
    </div>
  );
}
