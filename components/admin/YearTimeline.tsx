"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { formatNumericDate, isSameDay } from "@/lib/format";

const PX_PER_DAY = 16;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TimelineDay = {
  _id: string;
  order: number;
  topic: string;
  schedule: { lessonAt: number } | null;
};

/**
 * One year's lessons on a week grid. Scrolls horizontally when the year runs
 * long (and on phones), starting at the selected lesson.
 */
export function YearTimeline({
  days,
  now,
  timeZone,
  selectedId,
  onSelect,
}: {
  days: TimelineDay[];
  now: number;
  timeZone: string;
  selectedId: string | null;
  onSelect: (dayId: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const scheduled = days.filter(
    (d): d is TimelineDay & { schedule: NonNullable<TimelineDay["schedule"]> } => d.schedule !== null,
  );
  const origin = Math.min(...scheduled.map((d) => d.schedule.lessonAt)) - 3 * DAY_MS;
  const end = Math.max(now, ...scheduled.map((d) => d.schedule.lessonAt)) + 7 * DAY_MS;
  const x = (ts: number) => Math.round(((ts - origin) / DAY_MS) * PX_PER_DAY);
  const focusAt = scheduled.find((d) => d._id === selectedId)?.schedule.lessonAt ?? now;
  const focusLeft = scheduled.length > 0 ? x(focusAt) : 0;

  // When the year is wider than the screen, start with the selected lesson in view.
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, focusLeft - el.clientWidth / 2);
  }, [focusLeft]);

  if (scheduled.length === 0) {
    return (
      <div className="grid h-[104px] place-items-center px-5 text-center text-sm text-ink3">
        No lessons scheduled for this year yet. Use “Set date” to add the first one.
      </div>
    );
  }

  const width = x(end);

  const months: Array<{ label: string; left: number }> = [];
  const cursor = new Date(origin);
  cursor.setUTCDate(1);
  for (let i = 0; i < 24; i++) {
    const left = x(cursor.getTime());
    if (left > width) break;
    if (left >= 0) {
      months.push({
        label: cursor.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
        left,
      });
    } else if (i === 0) {
      months.push({
        label: cursor.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
        left: 0,
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const todayLeft = x(now);

  return (
    <div ref={scroller} className="overflow-x-auto">
      <div className="relative mx-5 my-3.5 h-[96px]" style={{ width }}>
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-[22px] bottom-0"
          style={{
            backgroundImage: "linear-gradient(90deg, var(--ln) 1px, transparent 1px)",
            backgroundSize: `${7 * PX_PER_DAY}px 100%`,
          }}
        />
        {months.map((m) => (
          <b key={`${m.label}-${m.left}`} className="absolute top-0 text-xs font-bold text-ink2" style={{ left: m.left }}>
            {m.label}
          </b>
        ))}
        {todayLeft >= 0 && todayLeft <= width && (
          <>
            <span
              aria-hidden="true"
              className="absolute top-[18px] bottom-0 w-0.5 bg-ink"
              style={{ left: todayLeft }}
            />
            <span
              className="absolute top-0 inline-flex h-[18px] items-center rounded-full bg-ink px-1.5 text-[10.5px] font-extrabold tracking-[.05em] text-bg"
              style={{ left: todayLeft + 7 }}
            >
              TODAY
            </span>
          </>
        )}
        {scheduled.map((day) => {
          const { lessonAt } = day.schedule;
          const left = x(lessonAt);
          const isToday = isSameDay(lessonAt, now, timeZone);
          const selected = day._id === selectedId;
          return (
            <button
              key={day._id}
              type="button"
              onClick={() => onSelect(day._id)}
              aria-pressed={selected}
              aria-label={`Day ${day.order}: ${day.topic}, ${formatNumericDate(lessonAt, timeZone)}`}
              className={cn(
                "absolute top-[26px] h-[62px] w-[104px] cursor-pointer overflow-hidden rounded-xl border-0 px-[9px] py-[7px] text-left text-[13px] leading-[1.2]",
                isToday
                  ? "bg-mint font-bold text-on-mint"
                  : "bg-bg text-ink shadow-[0_1px_2px_rgba(14,23,20,.1)]",
                selected && "outline-2 outline-offset-2 outline-ink",
              )}
              style={{ left }}
            >
              <b className={cn("block text-xs leading-[1.3] font-bold whitespace-nowrap", !isToday && "text-ink3")}>
                D{day.order} · {formatNumericDate(lessonAt, timeZone)}
              </b>
              {day.topic}
            </button>
          );
        })}
      </div>
    </div>
  );
}
