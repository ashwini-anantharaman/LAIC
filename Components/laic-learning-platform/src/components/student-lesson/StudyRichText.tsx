import type { ReactNode } from "react";
import { coerceStudyText } from "../../lib/study-sections";

export function renderBoldMarkdown(text: string): ReactNode[] {
  const clean = coerceStudyText(text);
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(clean)) !== null) {
    if (match.index > last) {
      nodes.push(<span key={key++}>{clean.slice(last, match.index)}</span>);
    }
    nodes.push(
      <strong key={key++} className="text-white font-semibold">
        {match[1]}
      </strong>
    );
    last = match.index + match[0].length;
  }

  if (last < clean.length) {
    nodes.push(<span key={key++}>{clean.slice(last)}</span>);
  }

  return nodes.length ? nodes : [clean];
}

export function StudyRichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return <span className={className}>{renderBoldMarkdown(text)}</span>;
}
