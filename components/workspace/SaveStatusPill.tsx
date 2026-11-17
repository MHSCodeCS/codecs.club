"use client";

import { Pill } from "@/components/ui/Pill";
import { formatRelative } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import type { SaveStatus } from "@/lib/workspaceSync";

const announcement: Record<SaveStatus["kind"], string> = {
  saved: "All changes saved.",
  saving: "Saving.",
  offline: "Offline. Your changes are kept and save when you reconnect.",
  failed: "Save failed.",
};

/** Header save state. Only "Saved" means the server has the latest text. */
export function SaveStatusPill({
  status,
  timeZone,
  onRetry,
}: {
  status: SaveStatus;
  timeZone: string;
  onRetry: () => void;
}) {
  const now = useNow(1000);
  const pill = "h-[30px] px-2.5 text-[13px] font-semibold";
  return (
    <>
      <span role="status" className="sr-only">
        {announcement[status.kind]}
      </span>
      {status.kind === "saved" && (
        <Pill tone="mint" className={pill}>
          ✓ Saved{status.savedAt !== null && ` ${formatRelative(status.savedAt, now, timeZone)}`}
        </Pill>
      )}
      {status.kind === "saving" && (
        <Pill tone="neutral" className={pill}>
          Saving…
        </Pill>
      )}
      {status.kind === "offline" && (
        <span title="Your changes are kept on this computer and save when you reconnect.">
          <Pill tone="amber" className={pill}>
            Offline · changes kept
          </Pill>
        </span>
      )}
      {status.kind === "failed" && (
        <button
          type="button"
          onClick={onRetry}
          title={status.message}
          className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full border-0 bg-cor-s px-2.5 text-[13px] font-bold whitespace-nowrap text-cor-i"
        >
          Save failed · Retry
        </button>
      )}
    </>
  );
}
