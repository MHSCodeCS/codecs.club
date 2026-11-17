// lib/python/config.ts
var PYODIDE_VERSION = "314.0.7";
var PYODIDE_INDEX_PATH = `/pyodide/${PYODIDE_VERSION}/`;
var PYODIDE_PACKAGE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
var MAX_RUN_OUTPUT_CHARS = 2e6;
var STDIN_BUFFER_BYTES = 64 * 1024;

// lib/python/output.ts
var OutputBatcher = class {
  constructor(send, onDropped, options) {
    this.send = send;
    this.onDropped = onDropped;
    this.options = options;
    this.chunks = [];
    this.pending = 0;
    this.sent = 0;
    this.droppedReported = false;
    this.lastFlush = this.now();
  }
  now() {
    return this.options.now ? this.options.now() : Date.now();
  }
  write(stream, text) {
    if (text.length === 0) return;
    const room = this.options.maxRunChars - this.sent - this.pending;
    if (room <= 0) {
      this.reportDropped();
      return;
    }
    const kept = text.length > room ? text.slice(0, room) : text;
    const last = this.chunks[this.chunks.length - 1];
    if (last && last.stream === stream) last.text += kept;
    else this.chunks.push({ stream, text: kept });
    this.pending += kept.length;
    if (kept.length < text.length) this.reportDropped();
    if (this.pending >= (this.options.maxBatchChars ?? 16384) || this.now() - this.lastFlush >= (this.options.intervalMs ?? 50)) {
      this.flush();
    }
  }
  flush() {
    this.lastFlush = this.now();
    if (this.chunks.length === 0) return;
    const chunks = this.chunks;
    this.sent += this.pending;
    this.chunks = [];
    this.pending = 0;
    this.send(chunks);
  }
  reportDropped() {
    if (this.droppedReported) return;
    this.droppedReported = true;
    this.flush();
    this.onDropped();
  }
};

// lib/python/protocol.ts
var STDIN_IDLE = 0;
var STDIN_WAITING = 1;
var STDIN_READY = 2;
var STDIN_CANCELLED = 3;

// lib/python/runner.ts
var WORK_DIR = "/home/pyodide/work";
var RUNNER_SOURCE = String.raw`
import ast
import builtins
import importlib.abc
import importlib.machinery
import importlib.util
import os
import sys
import traceback

WORK_DIR = ${JSON.stringify(WORK_DIR)}

# Checks compile workspace modules with loop counters; never cache bytecode so
# normal runs and checks can't pick up each other's compiled modules.
sys.dont_write_bytecode = True


def forget_workspace_modules():
    """Drop modules imported from the workspace so edited files reload."""
    for name, module in list(sys.modules.items()):
        path = getattr(module, "__file__", None) or ""
        if path.startswith(WORK_DIR):
            del sys.modules[name]


def _is_student_frame(frame):
    path = frame.f_code.co_filename
    if path.startswith("<"):  # <frozen runpy>, <string>, …
        return False
    return not os.path.isabs(path) or path.startswith(WORK_DIR)


def _print_student_traceback(exc):
    tb = exc.__traceback__
    # Hide the runner's own frames; start at the student's code.
    while tb is not None and not _is_student_frame(tb.tb_frame):
        tb = tb.tb_next
    text = "".join(traceback.format_exception(type(exc), exc, tb))
    sys.stderr.write(text.replace(WORK_DIR + "/", ""))


LOOP_LIMIT = 1000


class ObservationLimit(BaseException):
    """Raised when a check has watched a loop for LOOP_LIMIT rounds."""


class _LoopCounter:
    def __init__(self):
        self.rounds = {}

    def tick(self, loop_id, outermost):
        count = self.rounds.get(loop_id, 0) + 1
        self.rounds[loop_id] = count
        # Rounds are counted at the start of the loop body, so exactly
        # LOOP_LIMIT rounds finish before the check stops the program.
        if outermost and count > LOOP_LIMIT:
            raise ObservationLimit()


class _LoopInstrumenter(ast.NodeTransformer):
    """Adds a counter call at the start of every loop body.

    Only outermost loops (not inside another loop in the same function) stop
    the check, so a finite inner loop inside an endless one never ends the run
    early, and an endless outer loop always does. Iterations are counted, not
    printed lines.
    """

    def __init__(self, prefix):
        self.prefix = prefix
        self.depth = 0
        self.next_id = 0

    def _loop(self, node):
        outermost = self.depth == 0
        loop_id = f"{self.prefix}:{self.next_id}"
        self.next_id += 1
        self.depth += 1
        self.generic_visit(node)
        self.depth -= 1
        call = ast.Call(
            func=ast.Name(id="__codecs_tick__", ctx=ast.Load()),
            args=[ast.Constant(loop_id), ast.Constant(outermost)],
            keywords=[],
        )
        tick = ast.Expr(call)
        ast.copy_location(tick, node.body[0] if node.body else node)
        node.body.insert(0, tick)
        return node

    visit_For = visit_While = visit_AsyncFor = _loop

    def _scope(self, node):
        saved = self.depth
        self.depth = 0
        self.generic_visit(node)
        self.depth = saved
        return node

    visit_FunctionDef = visit_AsyncFunctionDef = visit_Lambda = visit_ClassDef = _scope


def _instrumented_code(source, filename):
    tree = ast.parse(source, filename)
    tree = _LoopInstrumenter(filename).visit(tree)
    ast.fix_missing_locations(tree)
    return compile(tree, filename, "exec")


class _ObservedLoader(importlib.machinery.SourceFileLoader):
    # Always compile from source: a cached .pyc would skip the loop counters.
    def get_code(self, fullname):
        source = importlib.util.decode_source(self.get_data(self.path))
        return _instrumented_code(source, self.path)


class _ObservedFinder(importlib.abc.MetaPathFinder):
    """Imports workspace modules with loop counters during a check."""

    def find_spec(self, name, path, target=None):
        if path is not None:
            return None
        candidate = os.path.join(WORK_DIR, name + ".py")
        if not os.path.isfile(candidate):
            return None
        return importlib.util.spec_from_file_location(
            name, candidate, loader=_ObservedLoader(name, candidate)
        )


def _run_observed(entry):
    with open(entry, encoding="utf-8") as handle:
        code = _instrumented_code(handle.read(), entry)
    finder = _ObservedFinder()
    builtins.__codecs_tick__ = _LoopCounter().tick
    sys.meta_path.insert(0, finder)
    try:
        exec(code, {"__name__": "__main__", "__file__": entry, "__builtins__": builtins})
    finally:
        sys.meta_path.remove(finder)
        del builtins.__codecs_tick__
        forget_workspace_modules()


def run(entry, observe_loops=False):
    """Run entry as __main__ in a fresh namespace.

    Returns ok, error, stopped, or limit (a check stopped an endless loop
    after LOOP_LIMIT rounds, which is not an error).
    """
    import runpy

    os.chdir(WORK_DIR)
    if WORK_DIR not in sys.path:
        sys.path.insert(0, WORK_DIR)
    forget_workspace_modules()
    try:
        if observe_loops:
            _run_observed(entry)
        else:
            runpy.run_path(entry, run_name="__main__")
        return "ok"
    except ObservationLimit:
        return "limit"
    except KeyboardInterrupt:
        return "stopped"
    except SystemExit as exc:
        if exc.code is None or exc.code == 0:
            return "ok"
        if not isinstance(exc.code, int):
            print(exc.code, file=sys.stderr)
        return "error"
    except BaseException as exc:
        _print_student_traceback(exc)
        return "error"
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
`;
function installRunner(pyodide2) {
  pyodide2.FS.mkdirTree(WORK_DIR);
  pyodide2.FS.writeFile("/home/pyodide/_codecs_runner.py", RUNNER_SOURCE);
  pyodide2.runPython(
    "import sys\nif '/home/pyodide' not in sys.path: sys.path.append('/home/pyodide')\nimport _codecs_runner"
  );
}
function writeWorkspace(pyodide2, files) {
  const fs = pyodide2.FS;
  for (const name of fs.readdir(WORK_DIR)) {
    if (name === "." || name === "..") continue;
    const path = `${WORK_DIR}/${name}`;
    if (fs.isDir(fs.stat(path).mode)) removeTree(pyodide2, path);
    else fs.unlink(path);
  }
  for (const file of files) fs.writeFile(`${WORK_DIR}/${file.name}`, file.content);
}
function removeTree(pyodide2, dir) {
  const fs = pyodide2.FS;
  for (const name of fs.readdir(dir)) {
    if (name === "." || name === "..") continue;
    const path = `${dir}/${name}`;
    if (fs.isDir(fs.stat(path).mode)) removeTree(pyodide2, path);
    else fs.unlink(path);
  }
  fs.rmdir(dir);
}
function runEntry(pyodide2, entry, options = {}) {
  const runner = pyodide2.pyimport("_codecs_runner");
  try {
    return runner.run(entry, options.observeLoops ?? false);
  } finally {
    runner.destroy();
  }
}
async function loadImportedPackages(pyodide2, files, log) {
  const code = files.filter((f) => f.name.endsWith(".py")).map((f) => f.content).join("\n");
  await pyodide2.loadPackagesFromImports(code, {
    messageCallback: log,
    errorCallback: log
  });
}
async function installPackage(pyodide2, name, log) {
  await pyodide2.loadPackage("micropip", { messageCallback: log, errorCallback: log });
  const micropip = pyodide2.pyimport("micropip");
  try {
    await micropip.install(name);
    return { ok: true, message: `Installed ${name}.` };
  } catch (error) {
    return { ok: false, message: explainInstallError(name, String(error)) };
  } finally {
    micropip.destroy();
  }
}
function explainInstallError(name, raw) {
  if (/pure Python 3 wheel|wasm32|emscripten|binary wheel/i.test(raw)) {
    return `${name} can\u2019t be installed in the browser: it needs compiled code that isn\u2019t available here. Ask your teacher for another way.`;
  }
  if (/No known package|Can't fetch metadata|404|not found on PyPI|no matching distribution/i.test(raw)) {
    return `Couldn\u2019t find a package named \u201C${name}\u201D. Check the spelling.`;
  }
  if (/fetch|network|NetworkError|Failed to load/i.test(raw)) {
    return `Couldn\u2019t reach the package index to install ${name}. Check your connection and try again.`;
  }
  return `${name} couldn\u2019t be installed. ${raw.split("\n").filter(Boolean).pop() ?? ""}`.trim();
}

// lib/python/python.worker.ts
var scope = self;
var pyodide = null;
var interrupt = null;
var stdinControl = null;
var stdinData = null;
var currentRunId = 0;
var batcher = null;
var checkInputs = null;
var installed = /* @__PURE__ */ new Set();
var queue = Promise.resolve();
function post(message) {
  scope.postMessage(message);
}
function packageStatus(text) {
  post({ type: "package-status", text });
}
function writer(stream) {
  const decoder = new TextDecoder();
  return {
    isatty: false,
    write(buffer) {
      batcher?.write(stream, decoder.decode(buffer, { stream: true }));
      return buffer.length;
    }
  };
}
function readLine() {
  if (checkInputs !== null) {
    batcher?.flush();
    return checkInputs.shift() ?? "";
  }
  if (stdinControl === null || stdinData === null) {
    batcher?.write(
      "stderr",
      "input() needs a browser that supports isolated pages (Chrome on a Chromebook does). Your program got no input.\n"
    );
    return null;
  }
  batcher?.flush();
  Atomics.store(stdinControl, 0, STDIN_WAITING);
  post({ type: "input-request", runId: currentRunId });
  while (Atomics.load(stdinControl, 0) === STDIN_WAITING) {
    Atomics.wait(stdinControl, 0, STDIN_WAITING);
  }
  const state = Atomics.load(stdinControl, 0);
  Atomics.store(stdinControl, 0, STDIN_IDLE);
  if (state === STDIN_CANCELLED) {
    pyodide?.checkInterrupt();
    return null;
  }
  if (state !== STDIN_READY) return null;
  const length = Atomics.load(stdinControl, 1);
  return new TextDecoder().decode(stdinData.slice(0, length));
}
async function init(message) {
  interrupt = message.interrupt ? new Uint8Array(message.interrupt) : null;
  stdinControl = message.stdinControl ? new Int32Array(message.stdinControl) : null;
  stdinData = message.stdinData ? new Uint8Array(message.stdinData) : null;
  try {
    post({ type: "loading", step: "Downloading Python\u2026" });
    const pyodideModule = await import(
      /* webpackIgnore: true */
      `${message.indexUrl}pyodide.mjs`
    );
    post({ type: "loading", step: "Starting Python\u2026" });
    pyodide = await pyodideModule.loadPyodide({
      indexURL: message.indexUrl,
      packageBaseUrl: message.packageBaseUrl
    });
    pyodide.setStdout(writer("stdout"));
    pyodide.setStderr(writer("stderr"));
    pyodide.setStdin({ stdin: readLine, isatty: false });
    if (interrupt) pyodide.setInterruptBuffer(interrupt);
    installRunner(pyodide);
    const version = pyodide.runPython("import sys; sys.version.split()[0]");
    post({ type: "ready", pythonVersion: version });
  } catch (error) {
    pyodide = null;
    post({ type: "load-failed", message: String(error) });
  }
}
async function ensurePackages(packages) {
  if (pyodide === null) return;
  for (const spec of packages) {
    if (installed.has(spec)) continue;
    packageStatus(`Installing ${spec}\u2026`);
    const result = await installPackage(pyodide, spec, packageStatus);
    packageStatus(result.message);
    if (result.ok) installed.add(spec);
  }
}
async function run(message) {
  const runId = message.runId;
  currentRunId = runId;
  batcher = new OutputBatcher(
    (chunks) => post({ type: "output", runId, chunks }),
    () => post({ type: "output-dropped", runId }),
    { maxRunChars: MAX_RUN_OUTPUT_CHARS }
  );
  if (pyodide === null) {
    post({ type: "done", runId, outcome: "error", ms: 0 });
    return;
  }
  let outcome;
  let started = performance.now();
  try {
    await ensurePackages(message.packages);
    await loadImportedPackages(pyodide, message.files, packageStatus);
    writeWorkspace(pyodide, message.files);
    checkInputs = message.check ? [...message.check.inputs] : null;
    started = performance.now();
    outcome = runEntry(pyodide, message.entry, { observeLoops: message.check?.observeLoops ?? false });
  } catch (error) {
    batcher.write("stderr", `${String(error)}
`);
    outcome = "error";
  } finally {
    checkInputs = null;
  }
  batcher.flush();
  if (interrupt) interrupt[0] = 0;
  post({ type: "done", runId, outcome, ms: Math.round(performance.now() - started) });
}
async function install(message) {
  if (pyodide === null) {
    post({ type: "install-result", requestId: message.requestId, ok: false, message: "Python isn\u2019t ready yet." });
    return;
  }
  const result = await installPackage(pyodide, message.name, packageStatus);
  if (result.ok) installed.add(message.name);
  post({ type: "install-result", requestId: message.requestId, ...result });
}
scope.onmessage = (event) => {
  const message = event.data;
  queue = queue.then(async () => {
    if (message.type === "init") await init(message);
    else if (message.type === "run") await run(message);
    else await install(message);
  }).catch((error) => {
    post({ type: "package-status", text: `Python worker error: ${String(error)}` });
  });
};
//# sourceMappingURL=worker.js.map
