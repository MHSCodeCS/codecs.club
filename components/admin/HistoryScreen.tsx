"use client";

import { usePaginatedQuery } from "convex/react";
import { Button } from "@/components/ui/Button";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";

const PAGE_SIZE = 50;

function describe(json: string | null): string {
  if (json === null) return "—";
  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(value)
      .map(([key, v]) => `${key}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(", ");
  } catch {
    return json;
  }
}

/** Every recorded admin change: who, when, what, before and after. */
export function HistoryScreen() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.adminHistory.list,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <main className="flex flex-col gap-4 px-4 pt-4 pb-10 md:px-7">
      <h1 className="m-0 text-[34px] leading-[1.04] font-extrabold tracking-[-.035em] md:text-[46px]">
        History
      </h1>
      {status === "LoadingFirstPage" ? (
        <LoadingState label="Loading change history…" />
      ) : results.length === 0 ? (
        <EmptyState title="No changes recorded yet">
          Edits to students, schedules, lessons and settings appear here.
        </EmptyState>
      ) : (
        <div role="table" aria-label="Admin change history" className="flex flex-col">
          <div
            role="row"
            className="hidden h-[34px] grid-cols-[170px_140px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b border-ln px-3.5 text-[13px] font-semibold text-ink3 md:grid"
          >
            <span role="columnheader">When</span>
            <span role="columnheader">Who</span>
            <span role="columnheader">Change</span>
            <span role="columnheader">Before</span>
            <span role="columnheader">After</span>
          </div>
          {results.map((change) => (
            <div
              role="row"
              key={change._id}
              // Phones stack each change: when and who, then what, before and after.
              className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-b border-ln px-1 py-3 text-sm md:grid-cols-[170px_140px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-y-3 md:px-3.5 md:py-2.5"
            >
              <span role="cell" className="text-ink2">
                {new Date(change.at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <span role="cell" className="font-semibold">
                {change.actorName}
              </span>
              <span role="cell" className="max-md:col-span-2">
                {change.summary}
              </span>
              <span role="cell" className="font-mono text-xs break-words text-ink3 max-md:col-span-2">
                <span className="font-sans font-semibold md:hidden">Before: </span>
                {describe(change.before)}
              </span>
              <span role="cell" className="font-mono text-xs break-words max-md:col-span-2">
                <span className="font-sans font-semibold text-ink3 md:hidden">After: </span>
                {describe(change.after)}
              </span>
            </div>
          ))}
          {status === "CanLoadMore" && (
            <Button variant="secondary" className="mt-3 self-start max-md:h-11" onClick={() => loadMore(PAGE_SIZE)}>
              Load older changes
            </Button>
          )}
          {status === "LoadingMore" && <LoadingState label="Loading…" />}
        </div>
      )}
    </main>
  );
}
