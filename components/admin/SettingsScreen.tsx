"use client";

import { useQuery } from "convex/react";
import { Panel } from "@/components/ui/Panel";
import { LoadingState } from "@/components/ui/States";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { api } from "@/convex/_generated/api";
import { formatYear, timeZoneLabel } from "@/lib/format";

/** Approved behavior settings. Read-only until editing lands (Phase 10). */
export function SettingsScreen() {
  const settings = useQuery(api.adminSettings.get);
  return (
    <main className="flex max-w-3xl flex-col gap-4 px-4 pt-4 pb-10 md:px-7">
      <h1 className="m-0 text-[34px] leading-[1.04] font-extrabold tracking-[-.035em] md:text-[46px]">
        Settings
      </h1>
      {settings === undefined ? (
        <LoadingState label="Loading settings…" />
      ) : (
        <Panel tone="surface" className="flex flex-col gap-3 p-5 max-md:p-4" aria-label="School year">
          <h2 className="m-0 text-[22px] font-bold tracking-[-.02em]">School year</h2>
          <dl className="m-0 grid gap-x-4 gap-y-1 text-[15px] sm:grid-cols-[200px_1fr] sm:gap-y-2">
            <dt className="font-bold">Current school year</dt>
            <dd className="m-0 max-sm:mb-2">{formatYear(settings.currentYear)}</dd>
            <dt className="font-bold">Time zone</dt>
            <dd className="m-0">{timeZoneLabel(settings.timeZone)}</dd>
          </dl>
          <p className="m-0 text-sm text-ink3">
            Lesson dates and times use this time zone. Turn-in never closes: students can turn in,
            and turn in again, at any time. Editing these values from the dashboard arrives in
            Phase 10.
          </p>
        </Panel>
      )}
      <Panel tone="surface" className="flex flex-wrap items-center gap-4 p-5 max-md:p-4" aria-label="Appearance">
        <div className="flex-1">
          <h2 className="m-0 text-[22px] font-bold tracking-[-.02em]">Appearance</h2>
          <p className="m-0 text-sm text-ink3">Saved on this device only.</p>
        </div>
        <ThemeToggle className="max-md:[&>button]:h-10" />
      </Panel>
    </main>
  );
}
