import * as Y from "yjs";

/** The same initial CRDT on every peer, including pre-collaboration files. */
export function sharedDocument(content: string, state?: ArrayBuffer) {
  const doc = new Y.Doc();
  if (state) Y.applyUpdate(doc, new Uint8Array(state));
  else {
    const client = doc.clientID;
    doc.clientID = 1;
    doc.getText("code").insert(0, content);
    doc.clientID = client;
  }
  return doc;
}
export function sharedBytes(doc: Y.Doc): ArrayBuffer {
  return Uint8Array.from(Y.encodeStateAsUpdate(doc)).buffer;
}
export function replaceSharedText(doc: Y.Doc, content: string) {
  const text = doc.getText("code");
  if (text.toString() === content) return;
  // Preserve common characters so other peers' relative cursors survive.
  const before = text.toString();
  let start = 0, end = before.length, nextEnd = content.length;
  while (start < end && start < nextEnd && before[start] === content[start]) start++;
  while (end > start && nextEnd > start && before[end - 1] === content[nextEnd - 1]) { end--; nextEnd--; }
  doc.transact(() => { text.delete(start, end - start); text.insert(start, content.slice(start, nextEnd)); });
}
