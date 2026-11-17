import type { PyodideAPI } from "pyodide";
import type { RunFile, RunOutcome } from "./protocol";

/**
 * Runs student programs inside a loaded Pyodide. Kept free of worker and DOM
 * code so it can be tested in Node with the real runtime.
 */

export const WORK_DIR = "/home/pyodide/work";

/** Python helpers installed once per runtime as the `_codecs_runner` module. */
const RUNNER_SOURCE = String.raw`
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

export function installRunner(pyodide: PyodideAPI) {
  pyodide.FS.mkdirTree(WORK_DIR);
  pyodide.FS.writeFile("/home/pyodide/_codecs_runner.py", RUNNER_SOURCE);
  pyodide.runPython(
    "import sys\nif '/home/pyodide' not in sys.path: sys.path.append('/home/pyodide')\nimport _codecs_runner",
  );
}

/**
 * Replaces the work folder with exactly these files, so each run starts from
 * the workspace as it is now (deleted files don't linger between runs).
 */
export function writeWorkspace(pyodide: PyodideAPI, files: RunFile[]) {
  const fs = pyodide.FS;
  for (const name of fs.readdir(WORK_DIR) as string[]) {
    if (name === "." || name === "..") continue;
    const path = `${WORK_DIR}/${name}`;
    if (fs.isDir(fs.stat(path).mode)) removeTree(pyodide, path);
    else fs.unlink(path);
  }
  for (const file of files) fs.writeFile(`${WORK_DIR}/${file.name}`, file.content);
}

function removeTree(pyodide: PyodideAPI, dir: string) {
  const fs = pyodide.FS;
  for (const name of fs.readdir(dir) as string[]) {
    if (name === "." || name === "..") continue;
    const path = `${dir}/${name}`;
    if (fs.isDir(fs.stat(path).mode)) removeTree(pyodide, path);
    else fs.unlink(path);
  }
  fs.rmdir(dir);
}

/**
 * Runs the entry file. Output goes to whatever stdout/stderr Pyodide has.
 * With `observeLoops` (checks for endless-loop exercises), every outermost
 * loop stops the program after 1,000 rounds and the outcome is "limit".
 */
export function runEntry(
  pyodide: PyodideAPI,
  entry: string,
  options: { observeLoops?: boolean } = {},
): RunOutcome {
  const runner = pyodide.pyimport("_codecs_runner");
  try {
    return runner.run(entry, options.observeLoops ?? false) as RunOutcome;
  } finally {
    runner.destroy();
  }
}

/** Picks the file Run executes: main.py, else the shown .py file, else the first .py file. */
export function chooseEntry(fileNames: string[], shown: string | null, preferred: string): string | null {
  if (fileNames.includes(preferred)) return preferred;
  if (shown !== null && shown.endsWith(".py") && fileNames.includes(shown)) return shown;
  return fileNames.find((n) => n.endsWith(".py")) ?? null;
}

/**
 * Loads Pyodide-built packages the code imports (numpy, …) on demand. Standard
 * library modules need nothing. Progress goes to `log`, not program output.
 */
export async function loadImportedPackages(
  pyodide: PyodideAPI,
  files: RunFile[],
  log: (text: string) => void,
) {
  const code = files
    .filter((f) => f.name.endsWith(".py"))
    .map((f) => f.content)
    .join("\n");
  await pyodide.loadPackagesFromImports(code, {
    messageCallback: log,
    errorCallback: log,
  });
}

/** Installs a package with micropip (pure-Python wheels from PyPI, or Pyodide builds). */
export async function installPackage(
  pyodide: PyodideAPI,
  name: string,
  log: (text: string) => void,
): Promise<{ ok: boolean; message: string }> {
  await pyodide.loadPackage("micropip", { messageCallback: log, errorCallback: log });
  const micropip = pyodide.pyimport("micropip");
  try {
    await micropip.install(name);
    return { ok: true, message: `Installed ${name}.` };
  } catch (error) {
    return { ok: false, message: explainInstallError(name, String(error)) };
  } finally {
    micropip.destroy();
  }
}

/** Turns micropip failures into messages a student can act on. */
export function explainInstallError(name: string, raw: string): string {
  if (/pure Python 3 wheel|wasm32|emscripten|binary wheel/i.test(raw)) {
    return `${name} can’t be installed in the browser: it needs compiled code that isn’t available here. Ask for help to find another way.`;
  }
  if (/No known package|Can't fetch metadata|404|not found on PyPI|no matching distribution/i.test(raw)) {
    return `Couldn’t find a package named “${name}”. Check the spelling.`;
  }
  if (/fetch|network|NetworkError|Failed to load/i.test(raw)) {
    return `Couldn’t reach the package index to install ${name}. Check your connection and try again.`;
  }
  return `${name} couldn’t be installed. ${raw.split("\n").filter(Boolean).pop() ?? ""}`.trim();
}

export { packageSpecProblem } from "@/convex/lib/packages";
