"use client";

import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  Decoration,
  WidgetType,
} from "@codemirror/view";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { RemoteChange } from "@/lib/workspaceSync";
import { codecsEditorTheme } from "./editorTheme";

/** Marks changes that came from the server, so they are not saved back. */
const fromServer = Annotation.define<boolean>();

export type CodeEditorHandle = {
  /** Shows server text; files the editor is not showing just drop their cached state. */
  applyRemote(changes: RemoteChange[]): void;
  /** Replaces a file's text as a normal, undoable edit (uploads). */
  replace(name: string, content: string): void;
  focus(): void;
};

/**
 * One CodeMirror view for the workspace. Each file keeps its own EditorState
 * (and so its own undo history) while the student switches between files.
 */
export function CodeEditor({
  ref,
  fileName,
  readContent,
  onChange,
  readOnly,
  sharedText,
  onCursor,
  remoteCursors,
}: {
  ref?: Ref<CodeEditorHandle>;
  fileName: string;
  /** Current local text of a file (null once it is gone), used when a file is first shown. */
  readContent: (name: string) => string | null;
  onChange: (name: string, content: string) => void;
  readOnly: boolean;
  sharedText?: (name: string) => Y.Text | null;
  onCursor?: (file: string, anchor: number, head: number) => void;
  remoteCursors?: Array<{ name: string; anchor: number; head: number; teacher: boolean }>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const undoManagers = useRef(new Map<string, { text: Y.Text; manager: Y.UndoManager }>());
  const fileRef = useRef(fileName);
  const readOnlyRef = useRef(readOnly);
  const onChangeRef = useRef(onChange);
  const readContentRef = useRef(readContent);
  const sharedRef = useRef(sharedText);
  const cursorRef = useRef(onCursor);
  const cursors = useRef(new Compartment());
  const editable = useRef(new Compartment());

  useEffect(() => {
    sharedRef.current = sharedText;
    cursorRef.current = onCursor;
    onChangeRef.current = onChange;
    readContentRef.current = readContent;
  });

  const editableConfig = (ro: boolean) => [EditorView.editable.of(!ro), EditorState.readOnly.of(ro)];

  const collaboration = (name: string) => {
    const text = sharedRef.current?.(name);
    if (!text) return history();
    let undo = undoManagers.current.get(name);
    if (undo?.text !== text) {
      undo?.manager.destroy();
      // The binding adds its own local origin. Server updates must never enter undo.
      undo = { text, manager: new Y.UndoManager(text, { trackedOrigins: new Set() }) };
      undoManagers.current.set(name, undo);
    }
    return yCollab(text, null, { undoManager: undo.manager });
  };

  const createState = (name: string, doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        cursors.current.of([]),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        collaboration(name),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        indentUnit.of("    "),
        EditorState.tabSize.of(4),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        name.toLowerCase().endsWith(".py") ? python() : [],
        codecsEditorTheme,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...(sharedRef.current?.(name) ? yUndoManagerKeymap : historyKeymap),
          ...searchKeymap,
          indentWithTab,
        ]),
        editable.current.of(editableConfig(readOnlyRef.current)),
        EditorView.contentAttributes.of(() => ({
          "aria-label": `${fileRef.current.toLowerCase().endsWith(".py") ? "Python" : "Text"} editor, ${fileRef.current}`,
        })),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) cursorRef.current?.(fileRef.current, update.state.selection.main.anchor, update.state.selection.main.head);
          if (!update.docChanged) return;
          if (update.transactions.some((tr) => tr.annotation(fromServer))) return;
          onChangeRef.current(fileRef.current, update.state.doc.toString());
        }),
      ],
    });

  const stateFor = (name: string) =>
    (states.current.get(name)?.doc.toString() === (readContentRef.current(name) ?? "") ? states.current.get(name)! : createState(name, readContentRef.current(name) ?? ""));

  // Create the view once; it lives as long as the workspace screen.
  useEffect(() => {
    const view = new EditorView({ state: stateFor(fileRef.current), parent: hostRef.current! });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch files, keeping each file's state (cursor, undo history).
  useEffect(() => {
    const view = viewRef.current;
    if (view === null || fileRef.current === fileName) return;
    // A file removed by a restore must not come back with its old text later.
    if (readContentRef.current(fileRef.current) !== null) {
      states.current.set(fileRef.current, view.state);
    }
    fileRef.current = fileName;
    view.setState(stateFor(fileName));
    view.dispatch({ effects: editable.current.reconfigure(editableConfig(readOnlyRef.current)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
    viewRef.current?.dispatch({ effects: editable.current.reconfigure(editableConfig(readOnly)) });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const decorations = (remoteCursors ?? []).map(cursor => Decoration.widget({ widget: new PeerCursor(cursor.name, cursor.teacher), side: 1 }).range(Math.max(0, Math.min(cursor.head, view.state.doc.length))));
    decorations.sort((a, b) => a.from - b.from);
    view.dispatch({ effects: cursors.current.reconfigure(EditorView.decorations.of(Decoration.set(decorations))) });
  }, [remoteCursors, fileName]);

  useImperativeHandle(ref, () => ({
    applyRemote(changes) {
      const view = viewRef.current;
      for (const change of changes) {
        if (sharedRef.current?.(change.name)) continue;
        if (change.name !== fileRef.current || view === null || change.content === null) {
          states.current.delete(change.name);
          continue;
        }
        view.dispatch({
          changes: minimalChange(view.state.doc.toString(), change.content),
          annotations: [fromServer.of(true), Transaction.addToHistory.of(false)],
        });
      }
    },
    replace(name, content) {
      const view = viewRef.current;
      if (view !== null && name === fileRef.current) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
      } else {
        states.current.delete(name);
        onChangeRef.current(name, content);
      }
    },
    focus() {
      viewRef.current?.focus();
    },
  }));

  return <div ref={hostRef} className="h-full min-h-0" />;
}

/** The smallest single replacement turning `from` into `to`, so the cursor stays put. */
function minimalChange(from: string, to: string) {
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start++;
  let endFrom = from.length;
  let endTo = to.length;
  while (endFrom > start && endTo > start && from[endFrom - 1] === to[endTo - 1]) {
    endFrom--;
    endTo--;
  }
  return { from: start, to: endFrom, insert: to.slice(start, endTo) };
}

class PeerCursor extends WidgetType {
  constructor(readonly name: string, readonly teacher: boolean) { super(); }
  eq(other: PeerCursor) { return other.name === this.name && other.teacher === this.teacher; }
  toDOM() {
    const cursor = document.createElement("span");
    cursor.className = "peer-cursor";
    cursor.style.borderColor = this.teacher ? "#a78bfa" : "#67d6b0";
    const label = document.createElement("span");
    label.className = "peer-cursor-label";
    label.style.background = this.teacher ? "#a78bfa" : "#67d6b0";
    label.textContent = this.name + (this.teacher ? " · Teacher" : "");
    cursor.append(label);
    return cursor;
  }
}
