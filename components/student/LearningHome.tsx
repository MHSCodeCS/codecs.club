"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import { formatWeekdayDate, formatYear, isSameDay } from "@/lib/format";
import { focusDay, nextOpening } from "@/lib/progress";
import { useNow } from "@/lib/useNow";
import { AssignmentRow } from "./AssignmentRow";
import { DaysCompleteBar, DayTrack } from "./DayTrack";

export function LearningHome() {
  const home = useQuery(api.student.home);
  const now = useNow();
  if (home === undefined) return <LoadingState label="Loading your track…" />;

  const { days, timeZone } = home;
  const focus = focusDay(days, now, timeZone);
  const upcoming = focus === null ? nextOpening(days) : null;
  const focusIsToday =
    focus?.lessonAt != null && isSameDay(focus.lessonAt, now, timeZone);

  return (
    <main className="flex flex-col pb-10">
      <div className="flex flex-wrap items-end gap-6 px-6 pt-4 lg:px-10">
        <div>
          <div className="text-sm font-semibold text-ink3">
            {home.student.group} · {formatYear(home.year)}
          </div>
          <h1 className="m-0 mt-1 text-[clamp(40px,4.3vw,58px)] leading-[1.04] font-extrabold tracking-[-.035em]">
            {home.curriculum.name}
          </h1>
        </div>
        {days.length > 0 && (
          <div className="ml-auto">
            <DaysCompleteBar days={days} now={now} timeZone={timeZone} />
          </div>
        )}
      </div>

      <section aria-labelledby="track-title" className="px-6 pt-[22px] lg:px-10">
        <div className="mb-3 flex items-baseline gap-3">
          <h2 id="track-title" className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-.02em]">
            Your track
          </h2>
          <span className="text-sm text-ink3">{days.length} days, in learning order</span>
        </div>
        {days.length === 0 ? (
          <EmptyState title="No days yet">No lessons have been added to this curriculum yet.</EmptyState>
        ) : (
          <DayTrack days={days} now={now} timeZone={timeZone} />
        )}
      </section>

      <div className="grid gap-5 px-6 pt-5 lg:grid-cols-[minmax(0,1fr)_392px] lg:px-10">
        {focus ? (
          <section aria-labelledby="focus-title" className="rounded-[22px] bg-sf px-[18px] pt-4 pb-[18px]">
            <div className="mb-3 ml-1 flex flex-wrap items-center gap-3">
              <h2 id="focus-title" className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-.02em]">
                {focusIsToday ? "Today" : "Latest"} · Day {focus.order}: {focus.topic}
              </h2>
              {focus.lessonAt !== null && (
                <span className="text-sm text-ink3">{formatWeekdayDate(focus.lessonAt, timeZone)}</span>
              )}
              <Link
                href={`/learn/days/${focus._id}`}
                className="ml-auto font-bold text-mint-i no-underline"
              >
                Open lesson →
              </Link>
            </div>
            {focus.assignments.length === 0 ? (
              <EmptyState title="No assignments for this day" />
            ) : (
              <div className="flex flex-col gap-2">
                {focus.assignments.map((a) => (
                  <AssignmentRow key={a._id} assignment={a} />
                ))}
              </div>
            )}
          </section>
        ) : upcoming && upcoming.lessonAt !== null ? (
          <section aria-labelledby="focus-title" className="rounded-[22px] bg-sf px-[18px] pt-4 pb-[18px]">
            <h2 id="focus-title" className="m-0 ml-1 text-[22px] leading-[1.2] font-bold tracking-[-.02em]">
              Day {upcoming.order}: {upcoming.topic}
            </h2>
            <p className="mt-2 mb-0 ml-1 text-sm text-ink2">
              Opens {formatWeekdayDate(upcoming.lessonAt, timeZone)}, the day of the lesson.
            </p>
          </section>
        ) : (
          <div />
        )}

        <div className="flex flex-col gap-3">
          {home.latestFeedback && (
            <div className="rounded-[20px] bg-vio-s px-[18px] py-4">
              <b className="flex items-center gap-2 font-bold text-vio-i">
                <Avatar name={home.latestFeedback.authorName} tone="violet" size={22} className="text-[8px]" />
                {home.latestFeedback.authorName} reviewed {home.latestFeedback.assignmentTitle}
              </b>
              <p className="mt-1.5 mb-2.5 text-sm">“{home.latestFeedback.body}”</p>
              <Link href="/learn/work" className="font-bold text-vio-i">
                See it in My work →
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
