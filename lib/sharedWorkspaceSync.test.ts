import { expect, test } from "vitest";
import * as Y from "yjs";
import { WorkspaceSync, type SaveFile, type SaveResult } from "./workspaceSync";
import { sharedDocument, sharedBytes } from "../convex/lib/sharedText";
const describeError = () => ({ message: "offline", retry: false });

test("two peers converge with edits made before a delayed acknowledgement", async () => {
  const server = sharedDocument("print('hello')\n");
  let revision = 1;
  const initial = { name: "main.py", content: server.getText("code").toString(), revision, sharedState: sharedBytes(server) };
  const apply = async (files: SaveFile[]): Promise<SaveResult> => {
    for (const f of files) Y.applyUpdate(server, new Uint8Array(f.sharedUpdate!));
    return { savedAt: Date.now(), files: files.map(f => ({ name: f.name, revision: ++revision, sharedState: sharedBytes(server) })) };
  };
  let release: (() => void) | null = null;
  let delay = true;
  const left = new WorkspaceSync({ initialFiles: [initial], savedAt: 0, describeError, debounceMs: 10000, save: async files => { const result = await apply(files); if (delay) { delay = false; await new Promise<void>(resolve => { release = resolve; }); } return result; } });
  const right = new WorkspaceSync({ initialFiles: [initial], savedAt: 0, describeError, debounceMs: 10000, save: apply });
  left.edit("main.py", "# left\nprint('hello')\n");
  const flushed = left.flush();
  await Promise.resolve();
  left.edit("main.py", "# left\nprint('hello')\n# in flight\n");
  right.edit("main.py", "print('hello')\n# right\n");
  await right.flush();
  const saved = { name: "main.py", content: server.getText("code").toString(), revision, sharedState: sharedBytes(server) };
  left.applyServer([saved], Date.now());
  expect(left.content("main.py")).toContain("# in flight");
  expect(left.content("main.py")).toContain("# right");
  (release as unknown as () => void)();
  await flushed;
  const final = { name: "main.py", content: server.getText("code").toString(), revision, sharedState: sharedBytes(server) };
  left.applyServer([final], Date.now()); right.applyServer([final], Date.now());
  expect(left.content("main.py")).toBe(right.content("main.py"));
  expect(left.hasUnsaved()).toBe(false);
  expect(final.content).toContain("# left"); expect(final.content).toContain("# right"); expect(final.content).toContain("# in flight");
  left.stop(); right.stop();
});
