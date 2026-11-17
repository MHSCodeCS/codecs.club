"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CodeView } from "@/components/ui/CodeView";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { formatShortDate, formatTime, isSameDay } from "@/lib/format";
import { useNow } from "@/lib/useNow";

type VersionSummary = FunctionReturnType<typeof api.workspaces.versions>["page"][number];

const PAGE_SIZE = 20;

function versionTime(at: number, now: number, timeZone: string): string {
  return isSameDay(at, now, timeZone)
    ? formatTime(at, timeZone)
    : `${formatShortDate(at, timeZone)}, ${formatTime(at, timeZone)}`;
}

function reasonLabel(version: Pick<VersionSummary, "reason" | "restoredFrom">): string | null {
  switch (version.reason) {
    case "start":
      return "Starter code";
    case "restore":
      return version.restoredFrom !== null ? `Restored v${version.restoredFrom}` : "Restored";
    case "submit":
      return "Turned in";
    case "teacher": // legacy stored literal for an admin's edit; the version shows their name
      return "Edited together";
    case "check":
      return "Checked";
    case "autosave":
      return null;
  }
}

/** Versions tab: newest first, each can be inspected or restored. */
export function VersionsPanel({
  workspaceId,
  timeZone,
  inspecting,
  onInspect,
  onRestore,
  restoreDisabled,
}: {
  workspaceId: Id<"workspaces">;
  timeZone: string;
  inspecting: number | null;
  onInspect: (number: number) => void;
  onRestore: (number: number) => void;
  restoreDisabled: boolean;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.workspaces.versions,
    { workspaceId },
    { initialNumItems: PAGE_SIZE },
  );
  const now = useNow(60_000);
  if (status === "LoadingFirstPage") return <LoadingState label="Loading versions…" className="p-0" />;

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-ink3">
        A version is kept every couple of minutes while you work. Restoring one keeps your
        current files as a version too.
      </p>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {results.map((version) => {
          const selected = inspecting === version.number;
          const label = reasonLabel(version);
          return (
            <li
              key={version.number}
              className={cn(
                "flex items-center gap-2 rounded-[10px] py-1.5 pr-1.5 pl-3 text-sm",
                selected ? "bg-mint-s" : "bg-bg",
              )}
            >
              <button
                type="button"
                onClick={() => onInspect(version.number)}
                aria-pressed={selected}
                aria-label={`View v${version.number}`}
                className="flex min-w-0 flex-1 cursor-pointer flex-col items-start border-0 bg-transparent p-0 text-left"
              >
                <span>
                  <b className="font-bold">v{version.number}</b>{" "}
                  <span className="text-ink3">
                    · {versionTime(version.createdAt, now, timeZone)} · {version.by}
                  </span>
                </span>
                {label && <span className="text-xs text-ink3">{label}</span>}
              </button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRestore(version.number)}
                disabled={restoreDisabled}
                aria-label={`Restore v${version.number}`}
              >
                Restore
              </Button>
            </li>
          );
        })}
      </ol>
      {status === "CanLoadMore" && (
        <Button size="sm" variant="secondary" className="self-start" onClick={() => loadMore(PAGE_SIZE)}>
          Show older versions
        </Button>
      )}
      {status === "LoadingMore" && <LoadingState label="Loading older versions…" className="p-0" />}
    </div>
  );
}

/** Read-only view of one version in the editor area, with Restore. */
export function VersionView({
  workspaceId,
  number,
  timeZone,
  onClose,
  onRestore,
  restoreDisabled,
}: {
  workspaceId: Id<"workspaces">;
  number: number;
  timeZone: string;
  onClose: () => void;
  onRestore: (number: number) => void;
  restoreDisabled: boolean;
}) {
  const version = useQuery(api.workspaces.version, { workspaceId, number });
  const [fileName, setFileName] = useState<string | null>(null);
  const now = useNow(60_000);
  if (version === undefined) return <LoadingState label={`Loading v${number}…`} className="flex-1" />;
  if (version === null) {
    return (
      <div className="flex-1 p-4">
        <EmptyState title="That version isn’t available.">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Back to editing
          </Button>
        </EmptyState>
      </div>
    );
  }
  const file = version.files.find((f) => f.name === fileName) ?? version.files[0];
  const label = reasonLabel(version);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 bg-code-hl px-4 py-2 text-sm">
        <b className="font-bold">Viewing v{version.number}</b>
        <span className="text-ink3">
          · {versionTime(version.createdAt, now, timeZone)} · {version.by}
          {label && ` · ${label}`} · read-only
        </span>
        <span className="ml-auto flex gap-1.5">
          <Button
            size="sm"
            variant="primary"
            onClick={() => onRestore(version.number)}
            disabled={restoreDisabled}
          >
            Restore v{version.number}
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Back to editing
          </Button>
        </span>
      </div>
      {version.files.length > 1 && (
        <div role="group" aria-label={`Files in v${version.number}`} className="flex flex-none gap-1 px-3 pt-2">
          {version.files.map((f) => (
            <button
              key={f.name}
              type="button"
              aria-pressed={f.name === file?.name}
              onClick={() => setFileName(f.name)}
              className={cn(
                "h-7 cursor-pointer rounded-md border-0 px-2.5 font-mono text-xs",
                f.name === file?.name ? "bg-sf2 font-semibold text-code-ink" : "bg-transparent text-ink3",
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
      <CodeView
        code={file?.content ?? ""}
        label={`${file?.name ?? "File"} in v${version.number} (read-only)`}
        className="min-h-0 flex-1 py-4 text-[15px] leading-[26px]"
      />
    </div>
  );
}
