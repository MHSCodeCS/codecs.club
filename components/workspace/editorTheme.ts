import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/**
 * CodeMirror theme from the CodeCS design (screen 4d): Geist Mono 15/26, a
 * 52px right-aligned gutter, a mint caret, and the --k/--f/--s/--n/--c/--o
 * syntax tokens. Colors are CSS variables, so the editor follows whatever
 * color-scheme its container sets (`.scheme-dark` by default).
 */
const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "var(--code-bg)",
      color: "var(--code-ink)",
      fontSize: "15px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
      fontWeight: "500",
      lineHeight: "26px",
    },
    ".cm-content": { padding: "16px 0", caretColor: "var(--mint)" },
    ".cm-line": { padding: "0 16px 0 2px" },
    ".cm-gutters": {
      backgroundColor: "var(--code-bg)",
      color: "var(--code-gut)",
      border: "none",
    },
    ".cm-lineNumbers": { minWidth: "52px" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 14px 0 8px", textAlign: "right" },
    ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--code-hl) 40%, transparent)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--code-ink)" },
    ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--mint)" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "color-mix(in oklab, var(--vio) 32%, transparent)" },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "color-mix(in oklab, var(--mint) 24%, transparent)",
      outline: "none",
    },
    ".cm-searchMatch": { backgroundColor: "color-mix(in oklab, var(--amb) 30%, transparent)" },
    ".cm-searchMatch-selected": { backgroundColor: "color-mix(in oklab, var(--amb) 55%, transparent)" },
    ".cm-panels": {
      backgroundColor: "var(--code-bar)",
      color: "var(--code-ink)",
      fontFamily: "'Open Sauce Sans', system-ui, sans-serif",
    },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--ln)" },
    ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--ln)" },
    ".cm-textfield": {
      backgroundColor: "var(--code-bg)",
      color: "var(--code-ink)",
      border: "1px solid var(--ln)",
      borderRadius: "6px",
    },
    ".cm-button": {
      backgroundImage: "none",
      backgroundColor: "var(--sf2)",
      color: "var(--ink)",
      border: "0",
      borderRadius: "6px",
    },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  {
    tag: [
      t.keyword,
      t.controlKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
      t.operatorKeyword,
      t.modifier,
      t.bool,
      t.null,
      t.self,
    ],
    color: "var(--k)",
    fontWeight: "600",
  },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
      t.definition(t.className),
    ],
    color: "var(--f)",
  },
  { tag: [t.string, t.special(t.string)], color: "var(--s)" },
  { tag: [t.number, t.escape], color: "var(--n)" },
  { tag: [t.comment, t.lineComment], color: "var(--c)", fontStyle: "italic" },
  {
    tag: [
      t.operator,
      t.arithmeticOperator,
      t.compareOperator,
      t.definitionOperator,
      t.updateOperator,
      t.bitwiseOperator,
      t.derefOperator,
      t.punctuation,
      t.separator,
      t.paren,
      t.squareBracket,
      t.brace,
    ],
    color: "var(--o)",
  },
  { tag: [t.variableName, t.propertyName], color: "var(--code-ink)" },
  { tag: t.invalid, color: "var(--cor-i)" },
]);

export const codecsEditorTheme = [theme, syntaxHighlighting(highlight)];
