// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { yUndoManagerKeymap } from "y-codemirror.next";
import * as Y from "yjs";
import { CodeEditor } from "../components/workspace/CodeEditor";
import { sharedDocument, sharedBytes } from "../convex/lib/sharedText";
const mounted: Root[] = [];
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const rect = { x: 0, y: 0, left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rect;
});
afterEach(async () => { for (const root of mounted.splice(0)) await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
async function mount(docs: Map<string, Y.Doc>, fileName = "main.py") {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); mounted.push(root);
  const render = async (name: string) => { await act(async () => root.render(createElement(CodeEditor, { fileName: name, readOnly: false, readContent: file => docs.get(file)?.getText("code").toString() ?? null, sharedText: file => docs.get(file)?.getText("code") ?? null, onChange: () => {} }))); };
  await render(fileName);
  const view = () => EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  return { view, render };
}

test("real CodeMirror peers converge after simultaneous edits and undo preserves the remote edit", async () => {
  const initial = sharedBytes(sharedDocument("print('hello')\n"));
  const leftDoc = sharedDocument("", initial), rightDoc = sharedDocument("", initial);
  const left = await mount(new Map([["main.py", leftDoc]]));
  const right = await mount(new Map([["main.py", rightDoc]]));
  await act(async () => {
    left.view().dispatch({ changes: { from: 0, insert: "# student\n" } });
    right.view().dispatch({ changes: { from: 0, insert: "# teacher\n" } });
  });
  await act(async () => {
    const a = Y.encodeStateAsUpdate(leftDoc), b = Y.encodeStateAsUpdate(rightDoc);
    Y.applyUpdate(leftDoc, b); Y.applyUpdate(rightDoc, a);
  });
  expect(left.view().state.doc.toString()).toBe(right.view().state.doc.toString());
  expect(left.view().state.doc.toString()).toContain("# student");
  expect(left.view().state.doc.toString()).toContain("# teacher");
  const undo = yUndoManagerKeymap.find(binding => binding.key === "Mod-z")!.run!;
  await act(async () => { undo(left.view()); Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc)); });
  expect(left.view().state.doc.toString()).not.toContain("# student");
  expect(left.view().state.doc.toString()).toContain("# teacher");
  expect(right.view().state.doc.toString()).toBe(left.view().state.doc.toString());
});

test("switching back to a file incorporates edits received while it was hidden", async () => {
  const main = sharedDocument("print('main')"), helper = sharedDocument("value = 1");
  const editor = await mount(new Map([["main.py", main], ["helpers.py", helper]]));
  await editor.render("helpers.py");
  await act(async () => { main.getText("code").insert(0, "# remote\n"); });
  await editor.render("main.py");
  expect(editor.view().state.doc.toString()).toBe("# remote\nprint('main')");
});
