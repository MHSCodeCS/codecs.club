import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CHECK_TIME_LIMIT_MS, STOP_GRACE_MS } from "./config";
import type { FromWorker, ToWorker } from "./protocol";
import { PythonRuntime, type WorkerLike } from "./runtime";

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: ToWorker[] = [];
  terminated = false;
  postMessage(message: ToWorker) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(message: FromWorker) {
    this.onmessage?.({ data: message } as MessageEvent<FromWorker>);
  }
}

function setup(isolated: boolean) {
  const workers: FakeWorker[] = [];
  const runtime = new PythonRuntime({
    isolated,
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  runtime.start();
  workers[0]!.emit({ type: "ready", pythonVersion: "3.14.2" });
  return { runtime, workers };
}

const files = [{ name: "main.py", content: "while True: pass\n" }];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PythonRuntime", () => {
  test("Run sends the files and shows output for the current run only", () => {
    const { runtime, workers } = setup(true);
    runtime.run(files, "main.py", ["emoji"]);
    const run = workers[0]!.posted.find((m) => m.type === "run");
    expect(run).toMatchObject({ type: "run", entry: "main.py", packages: ["emoji"], runId: 1 });
    workers[0]!.emit({ type: "output", runId: 0, chunks: [{ stream: "stdout", text: "stale" }] });
    workers[0]!.emit({ type: "output", runId: 1, chunks: [{ stream: "stdout", text: "hi\n" }] });
    workers[0]!.emit({ type: "done", runId: 1, outcome: "ok", ms: 12 });
    const snap = runtime.getSnapshot();
    expect(snap.output.map((s) => s.text).join("")).toBe("hi\n");
    expect(snap.status.kind).toBe("ready");
    expect(snap.lastRun).toMatchObject({ outcome: "ok", ms: 12, entry: "main.py", restarted: false });
  });

  test("Stop interrupts first and keeps Python when it stops in time", () => {
    const { runtime, workers } = setup(true);
    runtime.run(files, "main.py", []);
    const init = workers[0]!.posted[0] as Extract<ToWorker, { type: "init" }>;
    runtime.stop();
    expect(new Uint8Array(init.interrupt!)[0]).toBe(2);
    expect(runtime.getSnapshot().status.kind).toBe("stopping");
    workers[0]!.emit({ type: "done", runId: 1, outcome: "stopped", ms: 900 });
    vi.advanceTimersByTime(STOP_GRACE_MS + 10);
    expect(workers).toHaveLength(1);
    expect(workers[0]!.terminated).toBe(false);
    expect(runtime.getSnapshot().lastRun).toMatchObject({ outcome: "stopped", restarted: false });
  });

  test("Stop restarts Python when the program ignores the interrupt", () => {
    const { runtime, workers } = setup(true);
    runtime.run(files, "main.py", []);
    runtime.stop();
    vi.advanceTimersByTime(STOP_GRACE_MS + 10);
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    const snap = runtime.getSnapshot();
    expect(snap.lastRun).toMatchObject({ outcome: "stopped", restarted: true });
    expect(snap.output.at(-1)?.text).toMatch(/Python was restarted/);
    expect(snap.status.kind).toBe("loading");
  });

  test("without cross-origin isolation, Stop restarts Python right away", () => {
    const { runtime, workers } = setup(false);
    runtime.run(files, "main.py", []);
    const init = workers[0]!.posted[0] as Extract<ToWorker, { type: "init" }>;
    expect(init.interrupt).toBeNull();
    runtime.stop();
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
  });

  test("a typed line is shared with the worker and echoed in the output", () => {
    const { runtime, workers } = setup(true);
    runtime.run(files, "main.py", []);
    const init = workers[0]!.posted[0] as Extract<ToWorker, { type: "init" }>;
    workers[0]!.emit({ type: "input-request", runId: 1 });
    expect(runtime.getSnapshot().status).toMatchObject({ kind: "running", waitingForInput: true });
    runtime.sendInput("Ada");
    const control = new Int32Array(init.stdinControl!);
    expect(control[1]).toBe(3);
    expect(new TextDecoder().decode(new Uint8Array(init.stdinData!).slice(0, 3))).toBe("Ada");
    expect(runtime.getSnapshot().output.at(-1)).toMatchObject({ kind: "input", text: "Ada\n" });
  });

  test("a check captures printed output (not errors) and passes the loop limit through", async () => {
    const { runtime, workers } = setup(true);
    const pending = runtime.check(files, "main.py", [], { observeLoops: true, inputs: ["Ada"] });
    const run = workers[0]!.posted.find((m) => m.type === "run");
    expect(run).toMatchObject({ check: { observeLoops: true, inputs: ["Ada"] } });
    expect(runtime.getSnapshot().status).toMatchObject({ kind: "running", mode: "check" });
    workers[0]!.emit({
      type: "output",
      runId: 1,
      chunks: [
        { stream: "stdout", text: "Hello, Ada\n" },
        { stream: "stderr", text: "warning\n" },
      ],
    });
    workers[0]!.emit({ type: "done", runId: 1, outcome: "limit", ms: 40 });
    await expect(pending).resolves.toEqual({ outcome: "limit", output: "Hello, Ada\n", truncated: false, ms: 40 });
    expect(runtime.getSnapshot().lastRun).toMatchObject({ mode: "check", outcome: "limit" });
  });

  test("a check that runs too long is stopped and reported as a timeout", async () => {
    const { runtime, workers } = setup(true);
    const pending = runtime.check(files, "main.py", [], { observeLoops: false, inputs: [] });
    workers[0]!.emit({ type: "output", runId: 1, chunks: [{ stream: "stdout", text: "so far\n" }] });
    vi.advanceTimersByTime(CHECK_TIME_LIMIT_MS + 1);
    expect(runtime.getSnapshot().status.kind).toBe("stopping");
    workers[0]!.emit({ type: "done", runId: 1, outcome: "stopped", ms: CHECK_TIME_LIMIT_MS });
    await expect(pending).resolves.toMatchObject({ outcome: "timeout", output: "so far\n" });
    expect(runtime.getSnapshot().lastRun).toMatchObject({ timedOut: true });
  });

  test("Stop during a check reports it as stopped, not a timeout", async () => {
    const { runtime, workers } = setup(false);
    const pending = runtime.check(files, "main.py", [], { observeLoops: false, inputs: [] });
    runtime.stop();
    expect(workers).toHaveLength(2);
    await expect(pending).resolves.toMatchObject({ outcome: "stopped" });
  });

  test("a failed load shows Python as unavailable until retried", () => {
    const workers: FakeWorker[] = [];
    const runtime = new PythonRuntime({
      isolated: true,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.start();
    workers[0]!.emit({ type: "load-failed", message: "network" });
    expect(runtime.getSnapshot().status.kind).toBe("unavailable");
    runtime.restart();
    expect(workers).toHaveLength(2);
    expect(runtime.getSnapshot().status.kind).toBe("loading");
  });
});
