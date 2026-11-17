"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { PreviewBanner } from "@/components/ui/PreviewBanner";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import {
  FIXTURE_TIME_ZONE as TZ,
  myWorkFixture,
  type WorkItem,
  type WorkStatus,
} from "@/lib/fixtures";
import {
  formatShortDate,
  formatWeekdayDate,
  formatWeekdayDateTime,
  formatYear,
} from "@/lib/format";

/** 4e. Every saved piece of work across years and curriculum changes. */
export function MyWork() {
  const groups = myWorkFixture;
  const years = groups.map((g) => g.year);
  const [year, setYear] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string>("nametag");
  const visible = year === "all" ? groups : groups.filter((g) => g.year === year);
  const selected = groups.flatMap((g) => g.items).find((i) => i.id === selectedId) ?? null;

  return (
    <main className="flex flex-col pb-10">
      <div className="flex flex-wrap items-end gap-5 px-6 pt-4 lg:px-10">
        <h1 className="m-0 text-[clamp(40px,4.3vw,58px)] leading-[1.04] font-extrabold tracking-[-.035em]">
          My work
        </h1>
        <SegmentedControl
          label="Year"
          className="mb-1.5 ml-auto bg-sf"
          options={[
            { value: "all", label: "All years" },
            ...years.map((y) => ({ value: y, label: formatYear(y) })),
          ]}
          value={year}
          onChange={setYear}
        />
      </div>
      <PreviewBanner phase="Phase 2" className="mx-6 mt-3 lg:mx-10" />

      <div className="grid gap-6 px-6 pt-[22px] lg:grid-cols-[minmax(0,1fr)_452px] lg:px-10">
        <section aria-label="Work list" className="flex flex-col gap-0.5">
          {visible.map((group, gi) => (
            <div key={group.year} className={cn("flex flex-col gap-0.5", gi > 0 && "mt-3.5")}>
              <div className="flex items-center gap-2.5 px-3.5 pb-1.5">
                <b className="text-[15px] font-bold">{group.label}</b>
                {group.current ? (
                  <Pill tone="mint" className="px-2.5 font-semibold">
                    Current
                  </Pill>
                ) : (
                  <span className="text-[13px] text-ink3">previous curriculum</span>
                )}
              </div>
              {group.items.map((item) => (
                <WorkRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={() => setSelectedId(item.id)}
                />
              ))}
            </div>
          ))}
        </section>
        {selected && <WorkDetail item={selected} />}
      </div>
    </main>
  );
}

function statusPill(status: WorkStatus) {
  switch (status.kind) {
    case "inProgress":
      return (
        <Pill tone="amber" className="h-[26px] px-2.5 text-[13px] font-semibold">
          ◐ In progress · saved today
        </Pill>
      );
    case "notTurnedIn":
      return (
        <Pill tone="amber" className="h-[26px] px-2.5 text-[13px]">
          ! Not turned in
        </Pill>
      );
    case "turnedIn":
      return (
        <Pill className="h-[26px] px-2.5 text-[13px] font-semibold">✓ Turned in · not reviewed</Pill>
      );
    case "reviewed":
      return (
        <Pill tone="violet" className="h-[26px] px-2.5 text-[13px] font-semibold">
          {status.hasNote
            ? "Reviewed · has a note"
            : `Reviewed ${formatShortDate(status.reviewedAt, TZ)}`}
        </Pill>
      );
  }
}

function WorkRow({
  item,
  selected,
  onSelect,
}: {
  item: WorkItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const resume = item.status.kind === "inProgress";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        "grid cursor-pointer grid-cols-[minmax(0,1fr)_262px_92px] items-center gap-3 rounded-[14px] border-0 px-3.5 py-[11px] text-left",
        selected ? "bg-mint-s" : "bg-transparent hover:bg-sf",
      )}
    >
      <div className="min-w-0">
        <b className="font-bold">{item.title}</b>
        <div className="text-[13px] text-ink3">{item.context}</div>
      </div>
      {statusPill(item.status)}
      <span
        className={buttonClasses(
          resume ? "primary" : "secondary",
          "md",
          cn("w-full", selected && !resume && "bg-bg"),
        )}
      >
        {resume ? "Resume" : "Open"}
      </span>
    </button>
  );
}

function WorkDetail({ item }: { item: WorkItem }) {
  const detail = item.detail;
  return (
    <aside
      aria-label="Selected work"
      className="flex flex-col gap-4 self-start rounded-[24px] bg-sf px-6 py-[22px]"
    >
      <div>
        <div className="text-[13px] text-ink3">{detail?.heading ?? item.context}</div>
        <h2 className="m-0 mt-1 text-[34px] leading-[1.1] font-extrabold tracking-[-.035em]">
          {item.title}
        </h2>
      </div>
      {detail ? (
        <>
          <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
            {detail.attempts.map((attempt) => (
              <li key={attempt.attempt} className="contents">
                <TimelineStep marker={String(attempt.attempt)} tone="mint">
                  <b className="font-bold">Turned in</b>
                  <div className="text-[13px] text-ink3">
                    {formatWeekdayDateTime(attempt.submittedAt, TZ)} · version {attempt.version}
                    {attempt.check && ` · check: ${attempt.check}`}
                  </div>
                </TimelineStep>
                {attempt.review && (
                  <TimelineStep marker="✓" tone="violet">
                    <b className="font-bold">Reviewed by {attempt.review.by}</b>
                    <div className="text-[13px] text-ink3">
                      {formatWeekdayDate(attempt.review.at, TZ)}
                    </div>
                    {attempt.review.note && (
                      <div className="mt-2.5 rounded-[14px] bg-bg px-3.5 py-3 text-sm">
                        <span className="mb-0.5 block text-xs font-bold text-vio-i">
                          Note from {attempt.review.by}
                        </span>
                        “{attempt.review.note}”
                      </div>
                    )}
                  </TimelineStep>
                )}
              </li>
            ))}
          </ol>
          <p className="m-0 text-[13px] text-ink2">
            You can open, edit and turn this in again anytime.
          </p>
          <div className="flex gap-2.5">
            <span className={buttonClasses("primary", "lg", "h-[42px]")}>Open work</span>
            <span className={buttonClasses("secondary", "lg", "h-[42px] bg-bg")}>
              View attempt {detail.attempts.length}
            </span>
          </div>
        </>
      ) : (
        <p className="m-0 text-sm text-ink3">Select reviewed work to see its attempts and notes.</p>
      )}
    </aside>
  );
}

function TimelineStep({
  marker,
  tone,
  children,
}: {
  marker: string;
  tone: "mint" | "violet";
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-7 place-items-center rounded-full text-[13px] font-extrabold",
          tone === "mint" ? "bg-mint text-on-mint" : "bg-vio text-on-vio",
        )}
      >
        {marker}
      </span>
      <div>{children}</div>
    </div>
  );
}
