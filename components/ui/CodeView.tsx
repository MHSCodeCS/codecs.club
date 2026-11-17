import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { tokenClass, tokenizePythonLine } from "@/lib/pythonTokens";

export type CodeCursor = {
  /** 1-based line the labeled cursor sits on. */
  line: number;
  label: string;
  tone: "admin" | "student";
};

/**
 * Read-only, syntax-colored Python with a line gutter. Used for submitted
 * snapshots, starter files and previews until the live editor (CodeMirror) lands.
 */
export function CodeView({
  code,
  cursors = [],
  highlightLines = [],
  highlightTone = "admin",
  editorScheme = "dark",
  className,
  label,
}: {
  code: string;
  cursors?: CodeCursor[];
  highlightLines?: number[];
  /** Admin focus (violet) or a line that explains a failed check (coral). */
  highlightTone?: "admin" | "error";
  editorScheme?: "dark" | "app";
  className?: string;
  label?: string;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div
      role="region"
      aria-label={label ?? "Code"}
      className={cn(
        editorScheme === "dark" && "scheme-dark",
        "overflow-auto bg-code-bg py-3 font-mono text-[14px] leading-6 text-code-ink",
        className,
      )}
    >
      <ol className="m-0 list-none p-0">
        {lines.map((line, index) => {
          const n = index + 1;
          const lineCursors = cursors.filter((c) => c.line === n);
          const highlighted = highlightLines.includes(n);
          return (
            <li
              key={n}
              className={cn(
                "flex min-h-6 pr-4",
                highlighted && (highlightTone === "error" ? "bg-cor-s" : "bg-code-hl"),
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "w-11 flex-none select-none pr-3 text-right",
                  highlighted
                    ? highlightTone === "error"
                      ? "text-cor-i"
                      : "text-vio-i"
                    : "text-code-gut",
                )}
              >
                {n}
              </span>
              <code className="whitespace-pre">
                {renderTokens(line)}
                {lineCursors.map((cursor) => (
                  <CursorFlag key={cursor.label} cursor={cursor} />
                ))}
              </code>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function renderTokens(line: string): ReactNode {
  if (line.length === 0) return " ";
  return tokenizePythonLine(line).map((token, i) => (
    <span key={i} className={tokenClass[token.kind]}>
      {token.text}
    </span>
  ));
}

function CursorFlag({ cursor }: { cursor: CodeCursor }) {
  const admin = cursor.tone === "admin";
  return (
    <span className="relative ml-0.5 inline-block align-middle">
      <span
        aria-hidden="true"
        className={cn("inline-block h-5 w-0.5 align-middle", admin ? "bg-vio" : "bg-mint")}
      />
      <span
        className={cn(
          "ml-1 rounded-md px-1.5 py-0.5 font-sans text-[11px] font-bold",
          admin ? "bg-vio text-on-vio" : "bg-mint text-on-mint",
        )}
      >
        {cursor.label}
      </span>
    </span>
  );
}
