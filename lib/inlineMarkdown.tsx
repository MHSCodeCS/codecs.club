import type { ReactNode } from "react";

/**
 * Renders the small markdown subset used in assignment text: **bold** and
 * `code`. Everything else is plain text; nothing is injected as HTML.
 */
export function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <b key={match.index} className="font-bold">
          {match[1]}
        </b>,
      );
    } else {
      nodes.push(
        <code
          key={match.index}
          className="rounded-md bg-bg px-1.5 py-px font-mono text-sm font-semibold"
        >
          {match[2]}
        </code>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
