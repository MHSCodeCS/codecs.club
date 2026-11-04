import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { WorkspaceSync, type SaveFile, type SaveResult } from "./workspaceSync";

type Pending = {
  files: SaveFile[];
  resolve: (result: SaveResult) => void;
  reject: (error: Error) => void;
};

function setup(files = [{ name: "main.py", content: "a", revision: 1 }]) {
  const calls: Pending[] = [];
  const sync = new WorkspaceSync({
    initialFiles: files,
    savedAt: 100,
    debounceMs: 500,
    maxWaitMs: 2_000,
    save: (sent) =>
      new Promise<SaveResult>((resolve, reject) => calls.push({ files: sent, resolve, reject })),
    describeError: (error) => ({
      message: error instanceof Error ? error.message : "Save failed.",
      retry: !(error instanceof Error && error.message.startsWith("INVALID")),
    }),
  });
  /** Resolves the oldest pending save as the server would. */
  const ack = async (savedAt = 200) => {
    const call = calls.shift()!;
    call.resolve({
      savedAt,
      files: call.files.map((f) => ({ name: f.name, revision: f.baseRevision + 1 })),
    });
    await vi.runAllTicks();
    await Promise.resolve();
  };
  return { sync, calls, ack };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("WorkspaceSync", () => {
  test("an edit is not shown as saved until the save resolves", async () => {
    const { sync, calls, ack } = setup();
    expect(sync.getSnapshot().status).toEqual({ kind: "saved", savedAt: 100 });

    sync.edit("main.py", "ab");
    expect(sync.getSnapshot().status.kind).toBe("saving");
    expect(sync.hasUnsaved()).toBe(true);

    vi.advanceTimersByTime(500);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.files).toEqual([{ name: "main.py", content: "ab", baseRevision: 1 }]);
    expect(sync.getSnapshot().status.kind).toBe("saving");

    await ack(300);
    expect(sync.getSnapshot().status).toEqual({ kind: "saved", savedAt: 300 });
    expect(sync.hasUnsaved()).toBe(false);
  });

  test("continuous typing still saves after the max wait", () => {
    const { sync, calls } = setup();
    for (let i = 0; i < 10; i++) {
      sync.edit("main.py", `a${i}`);
      vi.advanceTimersByTime(300);
    }
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  test("a failed save keeps the edit and retries with backoff", async () => {
    const { sync, calls, ack } = setup();
    sync.edit("main.py", "abc");
    vi.advanceTimersByTime(500);
    calls.shift()!.reject(new Error("Network hiccup"));
    await Promise.resolve();
    await Promise.resolve();

    expect(sync.getSnapshot().status).toEqual({
      kind: "failed",
      message: "Network hiccup",
      retrying: true,
    });
    expect(sync.content("main.py")).toBe("abc");

    vi.advanceTimersByTime(2_000);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.files[0]).toMatchObject({ content: "abc", baseRevision: 1 });
    await ack();
    expect(sync.getSnapshot().status.kind).toBe("saved");
  });

  test("a refused save is not retried until the next edit", async () => {
    const { sync, calls } = setup();
    sync.edit("main.py", "x".repeat(10));
    vi.advanceTimersByTime(500);
    calls.shift()!.reject(new Error("INVALID: too big"));
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(60_000);
    expect(calls).toHaveLength(0);
    expect(sync.getSnapshot().status).toMatchObject({ kind: "failed", retrying: false });

    sync.edit("main.py", "x");
    expect(sync.getSnapshot().status.kind).toBe("saving");
    vi.advanceTimersByTime(500);
    expect(calls).toHaveLength(1);
  });

  test("pending edits show offline while disconnected and save on reconnect", async () => {
    const { sync, calls, ack } = setup();
    sync.setConnected(false);
    sync.edit("main.py", "offline edit");
    expect(sync.getSnapshot().status.kind).toBe("offline");
    vi.advanceTimersByTime(500);
    // The Convex client queues the mutation; it resolves after reconnecting.
    sync.setConnected(true);
    expect(sync.getSnapshot().status.kind).toBe("saving");
    await ack();
    expect(sync.getSnapshot().status.kind).toBe("saved");
    expect(calls).toHaveLength(0);
  });

  test("our own save echoing back does not overwrite newer typing", async () => {
    const { sync, calls, ack } = setup();
    sync.edit("main.py", "one");
    vi.advanceTimersByTime(500);
    sync.edit("main.py", "one two");
    // Query update for the in-flight save arrives before the mutation resolves.
    const changes = sync.applyServer([{ name: "main.py", content: "one", revision: 2 }], 250);
    expect(changes).toEqual([]);
    expect(sync.content("main.py")).toBe("one two");
    await ack();
    vi.advanceTimersByTime(500);
    expect(calls[0]!.files[0]).toEqual({ name: "main.py", content: "one two", baseRevision: 2 });
  });

  test("server changes are adopted only when there are no local edits", () => {
    const { sync } = setup([
      { name: "main.py", content: "a", revision: 1 },
      { name: "notes.txt", content: "n", revision: 1 },
    ]);
    sync.edit("notes.txt", "my notes");
    const changes = sync.applyServer(
      [
        { name: "main.py", content: "restored", revision: 2 },
        { name: "notes.txt", content: "other tab", revision: 2 },
        { name: "data.csv", content: "x,y", revision: 1 },
      ],
      300,
    );
    expect(changes).toEqual([
      { name: "main.py", content: "restored" },
      { name: "data.csv", content: "x,y" },
    ]);
    expect(sync.content("notes.txt")).toBe("my notes");
    expect(sync.getSnapshot().notice).toMatch(/notes\.txt was also changed/);
  });

  test("files removed on the server go away unless edited here", () => {
    const { sync } = setup([
      { name: "main.py", content: "a", revision: 1 },
      { name: "extra.py", content: "e", revision: 1 },
    ]);
    const changes = sync.applyServer([{ name: "main.py", content: "a", revision: 1 }], 300);
    expect(changes).toEqual([{ name: "extra.py", content: null }]);
    expect(sync.getSnapshot().files.map((f) => f.name)).toEqual(["main.py"]);
  });

  test("a new file is sent with base revision 0 and flush waits for it", async () => {
    const { sync, calls, ack } = setup();
    sync.addFile("helpers.py", "");
    expect(sync.getSnapshot().files).toEqual([
      { name: "main.py", dirty: false },
      { name: "helpers.py", dirty: true },
    ]);
    let flushed = false;
    const done = sync.flush().then(() => {
      flushed = true;
    });
    expect(calls[0]!.files).toMatchObject([{ name: "helpers.py", content: "", baseRevision: 0 }]);
    expect(flushed).toBe(false);
    await ack();
    await done;
    expect(flushed).toBe(true);
  });
});
