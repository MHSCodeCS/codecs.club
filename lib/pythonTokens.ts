/**
 * Minimal Python line tokenizer for static, syntax-colored code views. Ported
 * from the CodeCS design so read-only snapshots match the editor palette. This
 * is a display helper, not a parser: one line at a time, no multi-line strings.
 */
export type TokenKind =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "builtin"
  | "name"
  | "space"
  | "operator";

export type Token = { text: string; kind: TokenKind };

const KEYWORDS =
  /^(for|in|while|if|elif|else|def|return|True|False|None|and|or|not|import|from|as|break|continue|pass|class|try|except|finally|with|lambda|yield|global|nonlocal|assert|raise|del|is)$/;
const BUILTINS =
  /^(print|range|input|len|int|str|float|list|dict|set|tuple|bool|abs|min|max|sum|sorted|enumerate|zip|round|type|open)$/;

export function tokenizePythonLine(line: string): Token[] {
  const pattern =
    /(#.*$)|("[^"]*"?|'[^']*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z_\d"'#]+)/g;
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    const [text, comment, string, number, word, space] = match;
    if (comment) tokens.push({ text, kind: "comment" });
    else if (string) tokens.push({ text, kind: "string" });
    else if (number) tokens.push({ text, kind: "number" });
    else if (word)
      tokens.push({
        text,
        kind: KEYWORDS.test(word) ? "keyword" : BUILTINS.test(word) ? "builtin" : "name",
      });
    else if (space) tokens.push({ text, kind: "space" });
    else tokens.push({ text, kind: "operator" });
  }
  return tokens;
}

export const tokenClass: Record<TokenKind, string> = {
  comment: "text-syn-c italic",
  string: "text-syn-s",
  number: "text-syn-n",
  keyword: "text-syn-k font-semibold",
  builtin: "text-syn-f",
  name: "text-code-ink",
  space: "",
  operator: "text-syn-o",
};
