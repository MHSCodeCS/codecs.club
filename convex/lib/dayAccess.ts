import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { zonedDateKey } from "./time";

/**
 * When students may open a lesson day (D04, decided October 28, 2026): from
 * the start of its lesson date in the school time zone. A day without a date
 * this school year isn't open. A student who already has work on a day keeps
 * it open (D13: no lockouts), even if its date later moves into the future or
 * is cleared. Only student functions call this; admins always see every day.
 */

export const MAX_ASSIGNMENTS_PER_DAY = 50;

type DbCtx = Pick<QueryCtx, "db">;

/**
 * Today in the school time zone, for queries. Reads the date the cron keeps
 * in `schoolClock`, so a subscribed query re-runs at midnight; reading the
 * wall clock wouldn't re-run it. Until the cron's first run (or right after a
 * time-zone change) it falls back to the query's start time.
 */
export async function schoolToday(ctx: DbCtx, timeZone: string): Promise<string> {
  const clock = await ctx.db.query("schoolClock").first();
  if (clock !== null && clock.timeZone === timeZone) return clock.today;
  return zonedDateKey(Date.now(), timeZone);
}

/** Today in the school time zone, for mutations, which may read the clock. */
export function schoolTodayNow(timeZone: string): string {
  return zonedDateKey(Date.now(), timeZone);
}

/** Whether a lesson at `lessonAt` has reached its date by `today` ("YYYY-MM-DD"). */
export function lessonDateReached(
  lessonAt: number | null,
  today: string,
  timeZone: string,
): boolean {
  return lessonAt !== null && zonedDateKey(lessonAt, timeZone) <= today;
}

export async function lessonSchedule(
  ctx: DbCtx,
  dayId: Id<"days">,
  year: string,
): Promise<Doc<"lessonSchedules"> | null> {
  return await ctx.db
    .query("lessonSchedules")
    .withIndex("by_dayId_and_year", (q) => q.eq("dayId", dayId).eq("year", year))
    .unique();
}

/**
 * The day's assignments (drafts included) with this student's workspace on
 * each, so callers can list progress and tell whether there is work here.
 */
export async function dayWork(
  ctx: DbCtx,
  studentId: Id<"students">,
  dayId: Id<"days">,
): Promise<Array<{ assignment: Doc<"assignments">; workspace: Doc<"workspaces"> | null }>> {
  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_dayId_and_order", (q) => q.eq("dayId", dayId))
    .take(MAX_ASSIGNMENTS_PER_DAY);
  const rows = [];
  for (const assignment of assignments) {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_studentId_and_assignmentId", (q) =>
        q.eq("studentId", studentId).eq("assignmentId", assignment._id),
      )
      .unique();
    rows.push({ assignment, workspace });
  }
  return rows;
}

/**
 * Whether the student may open this day. `today` comes from `schoolToday` in
 * queries and `schoolTodayNow` in mutations.
 */
export async function dayOpenForStudent(
  ctx: DbCtx,
  args: {
    student: Doc<"students">;
    day: Doc<"days">;
    year: string;
    timeZone: string;
    today: string;
  },
): Promise<{ open: boolean; lessonAt: number | null }> {
  const schedule = await lessonSchedule(ctx, args.day._id, args.year);
  const lessonAt = schedule?.lessonAt ?? null;
  if (lessonDateReached(lessonAt, args.today, args.timeZone)) return { open: true, lessonAt };
  const work = await dayWork(ctx, args.student._id, args.day._id);
  return { open: work.some((row) => row.workspace !== null), lessonAt };
}
