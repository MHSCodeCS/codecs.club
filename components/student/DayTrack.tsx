import Link from "next/link";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/format";
import { assignmentColor, assignmentFill, dayState, type DayState, type TrackDay } from "@/lib/progress";

/** The curriculum as a horizontal track of days, in learning order. */
export function DayTrack({
  days,
  now,
  timeZone,
}: {
  days: TrackDay[];
  now: number;
  timeZone: string;
}) {
  const states = days.map((day) => dayState(day, now, timeZone));
  const todayIndex = states.findIndex((s) => s.kind === "today");
  const columns = days
    .map((_, i) => (i === todayIndex ? "1.7fr" : "minmax(0,1fr)"))
    .join(" ");
  return (
    <ol
      className="m-0 grid list-none gap-2.5 p-0 max-lg:!grid-cols-4"
      style={{ gridTemplateColumns: columns }}
    >
      {days.map((day, i) => (
        <DayCard key={day._id} day={day} state={states[i]!} timeZone={timeZone} />
      ))}
    </ol>
  );
}

function DayCard({ day, state, timeZone }: { day: TrackDay; state: DayState; timeZone: string }) {
  const dateLabel = day.lessonAt !== null ? ` · ${formatShortDate(day.lessonAt, timeZone)}` : "";
  const today = state.kind === "today";
  const turnedIn = day.assignments.filter((a) => a.turnedIn).length;
  const inProgress = day.assignments.filter((a) => a.started && !a.turnedIn).length;

  const surface = {
    today: "bg-sf px-4",
    done: "bg-mint-s",
    open: "bg-amb-s",
    upcoming: "bg-sf",
    unscheduled: "border-[1.5px] border-dashed border-bd bg-transparent",
  }[state.kind];

  let footer: React.ReactNode;
  switch (state.kind) {
    case "today":
      footer = (
        <span className="text-[13px] font-semibold">
          {turnedIn} of {day.assignments.length} turned in
          {inProgress > 0 && ` · ${inProgress} in progress`}
        </span>
      );
      break;
    case "done":
      footer = (
        <span className="text-[13px] font-semibold text-mint-i">
          ✓ {state.turnedIn} of {state.total} turned in
        </span>
      );
      break;
    case "open":
      footer = (
        <span className="text-[13px] font-bold text-amb-i">
          ◐ {state.turnedIn} of {state.total} turned in
        </span>
      );
      break;
    case "upcoming":
      footer = <span className="text-[13px] font-semibold text-ink3">Upcoming</span>;
      break;
    case "unscheduled":
      footer = <span className="text-[13px] font-semibold text-ink3">Not scheduled</span>;
      break;
  }

  return (
    <li aria-current={today ? "step" : undefined} className="min-w-0">
      <Link
        href={`/learn/days/${day._id}`}
        style={{ background: assignmentFill(day.assignments, true) }}
        className={cn(
          "flex h-full min-h-[124px] flex-col gap-1 rounded-[18px] px-3.5 pt-3 pb-3.5 text-ink no-underline transition-shadow hover:shadow-card",
          surface,

        )}
      >
        <span
          className={cn(
            "flex items-center justify-between text-xs",
            today ? "font-bold" : "font-semibold text-ink3",
          )}
        >
          Day {day.order}
          {dateLabel}
          {today && <Pill tone="ink">TODAY</Pill>}
        </span>
        <b
          className={cn(
            today
              ? "text-[30px] leading-[1.05] font-extrabold tracking-[-.035em]"
              : "text-base leading-[1.25] font-bold",
            (state.kind === "upcoming" || state.kind === "unscheduled") && "text-ink2",
          )}
        >
          {day.topic}
        </b>
        <span className="mt-auto">{footer}</span>
      </Link>
    </li>
  );
}

/** Small segmented bar: one segment per day. */
export function DaysCompleteBar({
  days,
  now,
  timeZone,
}: {
  days: TrackDay[];
  now: number;
  timeZone: string;
}) {
  void now; void timeZone;
  const complete = days.filter(day => day.assignments.length > 0 && day.assignments.every(a => assignmentColor(a) === "mint")).length;
  return (
    <div className="flex w-[300px] flex-col gap-2 pb-2">
      <div className="flex items-baseline justify-between text-sm">
        <b className="font-bold">Days complete</b>
        <span className="text-ink2">
          <b className="text-xl font-extrabold text-ink">{complete}</b> of {days.length}
        </span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}>
        {days.map(day => <div
          key={day._id}
          role="img"
          aria-label={`Day ${day.order}: ${day.assignments.map(a => `${a.title}: ${assignmentColor(a) === "mint" ? "Complete" : assignmentColor(a) === "cor" ? "Incomplete" : "Pending"}`).join(", ") || "No assignments"}`}
          className="h-2.5 rounded-[5px] bg-sf2"
          style={{ background: assignmentFill(day.assignments) }}
        />)}
      </div>
    </div>
  );
}
