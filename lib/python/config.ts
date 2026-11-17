/**
 * Pyodide release served from /public/pyodide/<version>/ (copied from the npm
 * package by scripts/copy-pyodide.mjs). Keep in step with package.json; a test
 * checks they match.
 */
export const PYODIDE_VERSION = "314.0.7";

/** The worker bundled by scripts/prepare-python.mjs (an ES module worker). */
export const PYTHON_WORKER_PATH = "/python/worker.js";

/** Same-origin location of the core runtime files. */
export const PYODIDE_INDEX_PATH = `/pyodide/${PYODIDE_VERSION}/`;

/** Optional packages (micropip, numpy, …) load from the matching CDN release. */
export const PYODIDE_PACKAGE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** The file Run executes when it exists. */
export const ENTRY_FILE = "main.py";

/** Most output one run forwards from the worker; the rest is counted, not shown. */
export const MAX_RUN_OUTPUT_CHARS = 2_000_000;

/** Most output kept on screen; older output is trimmed from the top. */
export const MAX_VISIBLE_OUTPUT_CHARS = 200_000;

/** A check run is stopped after this long (endless loops normally stop at 1,000 rounds first). */
export const CHECK_TIME_LIMIT_MS = 10_000;

/** Most printed output a check sends for evaluation. */
export const MAX_CHECK_OUTPUT_CHARS = 200_000;

/** How long Stop waits for Python to interrupt itself before restarting it. */
export const STOP_GRACE_MS = 2_000;

/** Bytes available for one line typed into input(). */
export const STDIN_BUFFER_BYTES = 64 * 1024;
