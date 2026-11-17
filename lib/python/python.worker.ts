/**
 * The Python worker: loads Pyodide off the UI thread and runs student files.
 * Stop writes SIGINT into a shared interrupt buffer; input() blocks on a shared
 * stdin buffer until the workspace sends a line. Both need cross-origin
 * isolation; without it the workspace stops by restarting this worker.
 */
import type { PyodideAPI } from "pyodide";
import { MAX_RUN_OUTPUT_CHARS } from "./config";
import { OutputBatcher } from "./output";
import {
  STDIN_CANCELLED,
  STDIN_IDLE,
  STDIN_READY,
  STDIN_WAITING,
  type FromWorker,
  type OutputStream,
  type RunOutcome,
  type ToWorker,
} from "./protocol";
import { installPackage, installRunner, loadImportedPackages, runEntry, writeWorkspace } from "./runner";

/** The worker's global scope (typed minimally; the project compiles with the DOM lib). */
const scope = self as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

let pyodide: PyodideAPI | null = null;
let interrupt: Uint8Array | null = null;
let stdinControl: Int32Array | null = null;
let stdinData: Uint8Array | null = null;
let currentRunId = 0;
let batcher: OutputBatcher | null = null;
/** During a check, input() reads these lines, then empty lines; never blocks. */
let checkInputs: string[] | null = null;
/** Packages micropip has installed in this runtime (lost on restart). */
const installed = new Set<string>();
/** Messages are handled one at a time, in order. */
let queue: Promise<void> = Promise.resolve();

function post(message: FromWorker) {
  scope.postMessage(message);
}

function packageStatus(text: string) {
  post({ type: "package-status", text });
}

/** A Pyodide stream writer that decodes bytes and feeds the batcher. */
function writer(stream: OutputStream) {
  const decoder = new TextDecoder();
  return {
    isatty: false,
    write(buffer: Uint8Array) {
      batcher?.write(stream, decoder.decode(buffer, { stream: true }));
      return buffer.length;
    },
  };
}

/** Blocks until the workspace sends a line for input(), or Stop is pressed. */
function readLine(): string | null {
  if (checkInputs !== null) {
    // Send the prompt now: if the program hangs afterwards and Python has to
    // be restarted, buffered output would otherwise be lost.
    batcher?.flush();
    return checkInputs.shift() ?? "";
  }
  if (stdinControl === null || stdinData === null) {
    batcher?.write(
      "stderr",
      "input() needs a browser that supports isolated pages (Chrome on a Chromebook does). " +
        "Your program got no input.\n",
    );
    return null;
  }
  batcher?.flush(); // Show the prompt before waiting.
  Atomics.store(stdinControl, 0, STDIN_WAITING);
  post({ type: "input-request", runId: currentRunId });
  while (Atomics.load(stdinControl, 0) === STDIN_WAITING) {
    Atomics.wait(stdinControl, 0, STDIN_WAITING);
  }
  const state = Atomics.load(stdinControl, 0);
  Atomics.store(stdinControl, 0, STDIN_IDLE);
  if (state === STDIN_CANCELLED) {
    pyodide?.checkInterrupt(); // Raises KeyboardInterrupt when Stop was pressed.
    return null;
  }
  if (state !== STDIN_READY) return null;
  const length = Atomics.load(stdinControl, 1);
  // Copy out of shared memory: TextDecoder refuses shared buffers.
  return new TextDecoder().decode(stdinData.slice(0, length));
}

async function init(message: Extract<ToWorker, { type: "init" }>) {
  interrupt = message.interrupt ? new Uint8Array(message.interrupt) : null;
  stdinControl = message.stdinControl ? new Int32Array(message.stdinControl) : null;
  stdinData = message.stdinData ? new Uint8Array(message.stdinData) : null;
  try {
    post({ type: "loading", step: "Downloading Python…" });
    const pyodideModule = (await import(
      /* webpackIgnore: true */ `${message.indexUrl}pyodide.mjs`
    )) as typeof import("pyodide");
    post({ type: "loading", step: "Starting Python…" });
    pyodide = await pyodideModule.loadPyodide({
      indexURL: message.indexUrl,
      packageBaseUrl: message.packageBaseUrl,
    });
    pyodide.setStdout(writer("stdout"));
    pyodide.setStderr(writer("stderr"));
    pyodide.setStdin({ stdin: readLine, isatty: false });
    if (interrupt) pyodide.setInterruptBuffer(interrupt);
    installRunner(pyodide);
    const version = pyodide.runPython("import sys; sys.version.split()[0]") as string;
    post({ type: "ready", pythonVersion: version });
  } catch (error) {
    pyodide = null;
    post({ type: "load-failed", message: String(error) });
  }
}

async function ensurePackages(packages: string[]) {
  if (pyodide === null) return;
  for (const spec of packages) {
    if (installed.has(spec)) continue;
    packageStatus(`Installing ${spec}…`);
    const result = await installPackage(pyodide, spec, packageStatus);
    packageStatus(result.message);
    if (result.ok) installed.add(spec);
  }
}

async function run(message: Extract<ToWorker, { type: "run" }>) {
  const runId = message.runId;
  currentRunId = runId;
  batcher = new OutputBatcher(
    (chunks) => post({ type: "output", runId, chunks }),
    () => post({ type: "output-dropped", runId }),
    { maxRunChars: MAX_RUN_OUTPUT_CHARS },
  );
  if (pyodide === null) {
    post({ type: "done", runId, outcome: "error", ms: 0 });
    return;
  }
  let outcome: RunOutcome;
  let started = performance.now();
  try {
    await ensurePackages(message.packages);
    await loadImportedPackages(pyodide, message.files, packageStatus);
    writeWorkspace(pyodide, message.files);
    checkInputs = message.check ? [...message.check.inputs] : null;
    started = performance.now();
    outcome = runEntry(pyodide, message.entry, { observeLoops: message.check?.observeLoops ?? false });
  } catch (error) {
    batcher.write("stderr", `${String(error)}\n`);
    outcome = "error";
  } finally {
    checkInputs = null;
  }
  batcher.flush();
  if (interrupt) interrupt[0] = 0;
  post({ type: "done", runId, outcome, ms: Math.round(performance.now() - started) });
}

async function install(message: Extract<ToWorker, { type: "install" }>) {
  if (pyodide === null) {
    post({ type: "install-result", requestId: message.requestId, ok: false, message: "Python isn’t ready yet." });
    return;
  }
  const result = await installPackage(pyodide, message.name, packageStatus);
  if (result.ok) installed.add(message.name);
  post({ type: "install-result", requestId: message.requestId, ...result });
}

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  queue = queue
    .then(async () => {
      if (message.type === "init") await init(message);
      else if (message.type === "run") await run(message);
      else await install(message);
    })
    .catch((error: unknown) => {
      post({ type: "package-status", text: `Python worker error: ${String(error)}` });
    });
};
