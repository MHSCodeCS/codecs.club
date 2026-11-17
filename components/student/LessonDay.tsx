"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { AssignmentTypeTag, Pill } from "@/components/ui/Pill";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/cn";
import { formatRelative, formatTime, formatWeekdayDate, isSameDay } from "@/lib/format";
import { assignmentStatus, type AssignmentProgress } from "@/lib/progress";
import { slidesProvider } from "@/lib/slides";
import { useNow } from "@/lib/useNow";

export function LessonDay({ dayId }: { dayId: string }) {
  const data = useQuery(api.student.day, { dayId });
  const now = useNow(15_000);
  if (data === undefined) return <LoadingState label="Loading the lesson…" />;
  if (data === null) {
    return (
      <main className="px-6 pt-6 lg:px-10">
        <EmptyState title="This lesson isn’t in your curriculum">
          <Link href="/learn">Back to your learning home</Link>
        </EmptyState>
      </main>
    );
  }

  const { day, timeZone } = data;
  const isToday = day.lessonAt !== null && isSameDay(day.lessonAt, now, timeZone);

  if (!day.open) {
    // D04: the day shows up on the track but opens on its lesson date.
    return (
      <main className="flex flex-col px-6 pt-2.5 pb-10 lg:px-10">
        <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-ink3">
          <Link href="/learn" className="font-semibold text-ink2 no-underline">
            {data.curriculumName}
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Day {day.order}</span>
        </nav>
        <h1 className="m-0 mt-1 text-[clamp(36px,3.8vw,52px)] leading-[1.04] font-extrabold tracking-[-.035em]">
          Day {day.order}: {day.topic}
        </h1>
        <EmptyState
          title={
            day.lessonAt !== null
              ? `Opens ${formatWeekdayDate(day.lessonAt, timeZone)}`
              : "Not scheduled yet"
          }
          className="mt-5 max-w-xl"
        >
          {day.lessonAt !== null
            ? "You can open this lesson and its assignments on the day of the lesson."
            : "This lesson doesn’t have a date yet. It opens on its lesson day."}{" "}
          <Link href="/learn">Back to your learning home</Link>
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="flex flex-col pb-10">
      <div className="px-6 pt-2.5 lg:px-10">
        <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-ink3">
          <Link href="/learn" className="font-semibold text-ink2 no-underline">
            {data.curriculumName}
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Day {day.order}</span>
        </nav>
        <div className="mt-1 flex flex-wrap items-center gap-3.5">
          <h1 className="m-0 text-[clamp(36px,3.8vw,52px)] leading-[1.04] font-extrabold tracking-[-.035em]">
            Day {day.order}: {day.topic}
          </h1>
          {isToday && (
            <Pill tone="brand" className="h-6 px-[9px] text-[11px] font-extrabold tracking-[.05em]">
              TODAY
            </Pill>
          )}
          <span className="text-ink2">
            {day.lessonAt !== null
              ? `${formatWeekdayDate(day.lessonAt, timeZone)} · ${formatTime(day.lessonAt, timeZone)}`
              : "Not scheduled"}
          </span>
        </div>
      </div>

      <div className="grid gap-6 px-6 pt-[18px] lg:grid-cols-[minmax(0,1fr)_420px] lg:px-10">
        <section aria-label="Lesson cover" className="flex min-w-0 flex-col gap-3">
          <div className="relative aspect-video overflow-hidden rounded-[22px] bg-sf">
            {day.coverUrl ? (
              // Convex storage URLs are signed and short-lived; next/image adds nothing here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={day.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center p-6 text-center">
                <span className="text-[clamp(40px,6vw,88px)] leading-none font-extrabold tracking-[-.04em] text-ink3/50">
                  {day.topic}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3.5 rounded-[18px] bg-sf py-3 pr-3 pl-5">
            <div className="min-w-0 flex-1">
              <b className="font-bold">Slides</b>
              <div className="text-sm text-ink2">
                {day.slidesUrl
                  ? "Presented live in class. Open them anytime to look back."
                  : "Slides for this day haven’t been shared yet."}
              </div>
            </div>
            {day.slidesUrl && (
              <ButtonLink href={day.slidesUrl} external variant="dark" size="lg" className="h-11">
                Open slides in {slidesProvider(day.slidesUrl)} ↗
              </ButtonLink>
            )}
          </div>
        </section>

        <section aria-labelledby="day-assignments" className="flex flex-col gap-2.5">
          <h2
            id="day-assignments"
            className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-.02em]"
          >
            Assignments
          </h2>
          {data.assignments.length === 0 ? (
            <EmptyState title="No assignments for this day">
              Nothing to turn in here. Check the slides or your other days.
            </EmptyState>
          ) : (
            data.assignments.map((a) => (
              <AssignmentCard key={a._id} assignment={a} now={now} timeZone={timeZone} />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function AssignmentCard({
  assignment,
  now,
  timeZone,
}: {
  assignment: AssignmentProgress;
  now: number;
  timeZone: string;
}) {
  const status = assignmentStatus(assignment);
  const inProgress = status.tone === "progress";
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-[20px] px-[18px] py-4",
        inProgress ? "bg-mint-s" : "bg-sf",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn(inProgress && "[&>span]:bg-bg")}>
          <AssignmentTypeTag type={assignment.type} />
        </span>
        {inProgress ? (
          <Pill tone="amber" className="h-6 px-2.5 font-semibold">
            <span aria-hidden="true">◐</span> In progress
            {assignment.savedAt !== null &&
              ` · saved ${formatRelative(assignment.savedAt, now, timeZone)}`}
          </Pill>
        ) : status.tone === "turnedIn" ? (
          <Pill tone="mint" className="h-6 px-2.5 font-semibold">
            <span aria-hidden="true">✓</span> Turned in
          </Pill>
        ) : (
          <span className="text-[13px] text-ink3">Not started</span>
        )}
      </div>
      <h3 className="m-0 text-[22px] leading-[1.15] font-extrabold tracking-[-.025em]">
        {assignment.title}
      </h3>
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm text-ink2">{assignment.summary}</span>
        <ButtonLink
          href={`/learn/assignments/${assignment._id}`}
          variant={inProgress ? "primary" : "secondary"}
          size="lg"
        >
          {inProgress ? "Resume" : "Open"}
        </ButtonLink>
      </div>
    </article>
  );
}
