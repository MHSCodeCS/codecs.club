/**
 * Messages between the workspace (main thread) and the Python worker.
 * Execution runs off the UI thread so loops never freeze editing, autosave or
 * the Stop button.
 */
export type OutputStream = "stdout" | "stderr";
export type OutputChunk = { stream: OutputStream; text: string };
/** "limit": a check stopped an endless loop after 1,000 rounds, as planned. */
export type RunOutcome = "ok" | "error" | "stopped" | "limit";
export type RunFile = { name: string; content: string };

export type ToWorker =
  | {
      type: "init";
      indexUrl: string;
      packageBaseUrl: string;
      /** Shared 1-byte buffer: writing 2 (SIGINT) raises KeyboardInterrupt. Null when not cross-origin isolated. */
      interrupt: SharedArrayBuffer | null;
      /** Int32 [state, byteLength] used to block input() until a line is typed. */
      stdinControl: SharedArrayBuffer | null;
      stdinData: SharedArrayBuffer | null;
    }
  | {
      type: "run";
      runId: number;
      files: RunFile[];
      entry: string;
      packages: string[];
      /** Checks feed input() from `inputs` and may observe loops. */
      check: { observeLoops: boolean; inputs: string[] } | null;
    }
  | { type: "install"; requestId: number; name: string };

export type FromWorker =
  | { type: "loading"; step: string }
  | { type: "ready"; pythonVersion: string }
  | { type: "load-failed"; message: string }
  | { type: "output"; runId: number; chunks: OutputChunk[] }
  | { type: "output-dropped"; runId: number }
  | { type: "input-request"; runId: number }
  | { type: "package-status"; text: string }
  | { type: "done"; runId: number; outcome: RunOutcome; ms: number }
  | { type: "install-result"; requestId: number; ok: boolean; message: string };

/** stdinControl[0] values. */
export const STDIN_IDLE = 0;
export const STDIN_WAITING = 1;
export const STDIN_READY = 2;
export const STDIN_CANCELLED = 3;

/** Signal number written into the interrupt buffer for Stop. */
export const SIGINT = 2;
