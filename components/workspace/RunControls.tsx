"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { RuntimeStatus } from "@/lib/python/runtime";

function statusLabel(status: RuntimeStatus, entry: string | null): { text: string; className: string } {
  switch (status.kind) {
    case "idle":
      return { text: "○ Python not loaded", className: "text-ink3" };
    case "loading":
      return { text: `◐ ${status.step}`, className: "text-amb-i" };
    case "ready":
      return { text: "● Python ready", className: "text-mint-i" };
    case "running":
      if (status.waitingForInput) return { text: "● Waiting for input", className: "text-amb-i" };
      return {
        text: `● ${status.mode === "check" ? "Checking" : "Running"} ${entry ?? ""}`.trimEnd(),
        className: "text-mint-i",
      };
    case "stopping":
      return { text: "◐ Stopping…", className: "text-amb-i" };
    case "installing":
      return { text: `◐ Installing ${status.name}…`, className: "text-amb-i" };
    case "unavailable":
      return { text: "✕ Python unavailable", className: "text-cor-i" };
  }
}

/** Runtime status with the Run and Stop buttons, beside the editor. */
export function RunControls({
  status,
  entry,
  runTarget,
  onRun,
  onStop,
  onRetry,
}: {
  status: RuntimeStatus;
  entry: string | null;
  /** The file Run will execute, or null when there is no .py file. */
  runTarget: string | null;
  onRun: () => void;
  onStop: () => void;
  onRetry: () => void;
}) {
  const label = statusLabel(status, entry);
  const running = status.kind === "running" || status.kind === "stopping";
  const canRun = status.kind === "ready" && runTarget !== null;
  return (
    <>
      <span role="status" className={cn("flex-none text-[13px] font-semibold whitespace-nowrap", label.className)}>
        {label.text}
      </span>
      {status.kind === "unavailable" && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
      <Button
        variant="primary"
        size="md"
        className="ml-1.5 px-[18px]"
        disabled={!canRun}
        onClick={onRun}
        title={
          runTarget === null
            ? "Add a .py file to run."
            : status.kind === "ready"
              ? `Run ${runTarget}`
              : status.kind === "unavailable"
                ? status.message
                : undefined
        }
      >
        ▶ Run
      </Button>
      <Button
        variant="secondary"
        size="md"
        disabled={!running || status.kind === "stopping"}
        onClick={onStop}
        title={running ? "Stop the program" : undefined}
      >
        ■ Stop
      </Button>
    </>
  );
}
