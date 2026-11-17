"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import { formatWeekdayDate } from "@/lib/format";
import { useGroup } from "./GroupContext";
import { NewAssignmentForm } from "./NewAssignmentForm";

type Overview = NonNullable<typeof api.adminCurriculum.overview._returnType>;
export type OverviewAssignment = Overview["days"][number]["assignments"][number];

const selectClass =
  "h-10 rounded-[10px] border-[1.5px] border-bd bg-bg px-3 text-[15px] font-bold text-ink max-md:h-11 max-md:min-w-0";

/** Draft / Published / Published with unpublished edits, always in words. */
export function AssignmentStatusPill({ assignment }: { assignment: OverviewAssignment }) {
  if (assignment.status === "draft") {
    return (
      <Pill tone="amber" className="px-2.5 font-semibold">
        ○ Draft
      </Pill>
    );
  }
  return (
    <Pill tone="mint" className="px-2.5 font-semibold">
      ● Published{assignment.unpublishedChanges ? " · edits" : ""}
    </Pill>
  );
}

/**
 * Assignments for the group's curriculum, by day. Each row opens the editor;
 * each day can start a new draft. Finding an assignment comes first on phones.
 */
export function AssignmentsScreen() {
  const { group } = useGroup();
  const [curriculumId, setCurriculumId] = useState<string | undefined>(undefined);
  const data = useQuery(api.adminCurriculum.overview, { group, curriculumId });

  if (data === undefined) return <LoadingState label="Loading assignments…" />;
  const tz = data.timeZone;

  return (
    <main className="flex flex-col pb-10">
      <div className="flex flex-wrap items-end gap-3 px-4 pt-4 md:px-7">
        <h1 className="m-0 text-[34px] leading-[1.04] font-extrabold tracking-[-.035em] md:text-[46px]">
          Assignments
        </h1>
        {data.curricula.length > 0 && (
          <select
            aria-label="Curriculum"
            className={`${selectClass} mb-0.5 max-md:w-full`}
            value={data.curriculum?._id ?? ""}
            onChange={(event) => setCurriculumId(event.target.value)}
          >
            {data.curricula.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="mx-4 mt-2 mb-0 text-sm text-ink2 md:mx-7">
        Drafts stay hidden from students. Publishing an edit makes a new task version: students’
        files and earlier results stay as they were.
      </p>

      {data.curriculum === null ? (
        <EmptyState title={`No ${group} curriculum yet`} className="mx-4 mt-4 md:mx-7" />
      ) : data.days.length === 0 ? (
        <EmptyState title="No days yet" className="mx-4 mt-4 md:mx-7">
          Add days on <Link href="/admin/curriculum">Curriculum</Link> first.
        </EmptyState>
      ) : (
        <div className="grid gap-3.5 px-4 pt-4 md:grid-cols-2 md:px-7 xl:grid-cols-3">
          {data.days.map((day) => (
            <section
              key={day._id}
              aria-labelledby={`day-${day._id}`}
              className="flex flex-col gap-1.5 rounded-[22px] bg-sf px-[18px] py-4 max-md:px-3.5"
            >
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
                <h2
                  id={`day-${day._id}`}
                  className="m-0 text-xs font-bold tracking-[.05em] text-ink3"
                >
                  DAY {day.order} · {day.topic.toUpperCase()}
                </h2>
                <span className="text-[12.5px] text-ink3">
                  {day.schedule ? formatWeekdayDate(day.schedule.lessonAt, tz) : "Not scheduled"}
                </span>
              </div>
              {day.assignments.length === 0 && (
                <span className="px-1 text-sm text-ink3">No assignments yet.</span>
              )}
              {day.assignments.map((a) => (
                <Link
                  key={a._id}
                  href={`/admin/assignments/${a._id}`}
                  className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-xl bg-bg px-3 py-[9px] text-sm text-ink no-underline hover:bg-sf2"
                >
                  <b className="truncate font-bold">{a.title}</b>
                  <AssignmentStatusPill assignment={a} />
                  <span className="col-span-2 text-[13px] text-ink3">
                    {a.type === "guided" ? "guided" : "open-ended"}
                  </span>
                </Link>
              ))}
              <NewAssignmentForm dayId={day._id} dayLabel={`Day ${day.order}`} className="mt-0.5" buttonClassName="self-start" />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
