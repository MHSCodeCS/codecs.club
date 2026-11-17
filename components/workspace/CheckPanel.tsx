"use client";

import { useQuery } from "convex/react";
import { Button } from "@/components/ui/Button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRelative } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { CheckResults } from "./CheckResults";

const runNote = {
  ok: null,
  error: "Your program stopped with an error, so parts were checked against the output before it.",
  limit: "Your loop was watched for 1,000 rounds, then stopped on purpose. That doesn’t count against you.",
  timeout: "Your program didn’t finish within 10 seconds, so parts were checked against the output so far.",
} as const;

/**
 * Guided check results: the latest check for this workspace, which code
 * version it checked, and whether it still matches the code (stale results
 * are labelled, never shown as current).
 */
export function CheckPanel({
  workspaceId,
  guided,
  timeZone,
  checking,
  canCheck,
  unsavedChanges,
  onCheck,
  error,
}: {
  workspaceId: Id<"workspaces">;
  guided: boolean;
  timeZone: string;
  checking: boolean;
  canCheck: boolean;
  unsavedChanges: boolean;
  onCheck: () => void;
  error: string | null;
}) {
  const latest = useQuery(api.checks.latest, guided ? { workspaceId } : "skip");
  const now = useNow(15_000);
  const stale = latest != null && (!latest.fresh || !latest.currentTask || unsavedChanges);

  return (
    <section aria-label="Check" className="flex min-h-0 min-w-0 flex-col">
      <div className="flex h-[42px] flex-none items-center gap-2.5 px-4">
        <b className="text-sm font-bold">Check</b>
        {latest && (
          <span className="truncate text-[13px] text-ink3">
            for v{latest.versionNumber} · {formatRelative(latest.ranAt, now, timeZone)}
            {!latest.currentTask && " · older task version"}
          </span>
        )}
        {guided && (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto h-7"
            disabled={!canCheck || checking}
            loading={checking}
            loadingLabel="Checking…"
            onClick={onCheck}
            title={canCheck ? "Run your program and check it against the task" : "Wait for Python to be ready."}
          >
            Run check
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-4 pt-0.5 pb-3">
        {!guided ? (
          <p className="m-0 text-sm text-ink3">
            Open-ended: there’s no automatic check. It’s reviewed after you turn it in.
          </p>
        ) : (
          <>
            {error && (
              <p role="alert" className="m-0 text-[13px] text-cor-i">
                {error}
              </p>
            )}
            {stale && (
              <p role="status" className="m-0 rounded-lg bg-amb-s px-2.5 py-1.5 text-[12.5px] text-amb-i">
                {!latest.currentTask
                  ? "This check used an older version of the task, and its result stays as it was. Run it again to check against the task as it is now."
                  : "You’ve changed your code since this check. Run it again to update."}
              </p>
            )}
            {latest === undefined ? null : latest === null ? (
              <p className="m-0 text-sm text-ink3">
                Run check to see which parts of the task your program meets. Spaces and line breaks
                don’t count.
              </p>
            ) : (
              <div className={stale ? "flex flex-1 flex-col opacity-70" : "flex flex-1 flex-col"}>
                <CheckResults outcome={latest.outcome} parts={latest.parts} partialMin={latest.partialMin} />
                {latest.runOutcome && runNote[latest.runOutcome] && (
                  <span className="mt-1.5 text-[12.5px] text-ink3">{runNote[latest.runOutcome]}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
