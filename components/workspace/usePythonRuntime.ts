"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getPythonRuntime, type PythonRuntime, type RuntimeSnapshot } from "@/lib/python/runtime";

const serverSnapshot: RuntimeSnapshot = {
  status: { kind: "idle" },
  output: [],
  outputTrimmed: false,
  outputDropped: false,
  lastRun: null,
  currentEntry: null,
  packageStatus: null,
  pythonVersion: null,
  isolated: false,
};

/**
 * The tab's Python runtime, claimed by one workspace. Python starts loading
 * when a workspace opens, since that is the only place it runs.
 */
export function usePythonRuntime(owner: string): { runtime: PythonRuntime; py: RuntimeSnapshot } {
  const runtime = getPythonRuntime();
  const py = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, () => serverSnapshot);
  useEffect(() => {
    runtime.claim(owner);
    runtime.start();
  }, [runtime, owner]);
  return { runtime, py };
}
