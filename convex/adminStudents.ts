import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getSettings, requireAdmin } from "./lib/access";
import { recordAdminChange } from "./lib/changes";
import { appError } from "./lib/errors";
import { normalizeLoginCode } from "./lib/loginCodes";
import { attendanceStatusValidator, groupValidator } from "./schema";

const MAX_ROSTER = 500;
/** How far after "now" a lesson still counts as today's for attendance. */
const LESSON_LOOKAHEAD_MS = 12 * 60 * 60 * 1000;

/**
 * Students in one group, with today's attendance. `now` comes from the client
 * (rounded to the minute) because queries must not read the wall clock.
 */
export const roster = query({
  args: { group: groupValidator, now: v.number() },
  returns: v.object({
    year: v.string(),
    timeZone: v.string(),
    attendanceLesson: v.union(
      v.null(),
      v.object({
        scheduleId: v.id("lessonSchedules"),
        lessonAt: v.number(),
        topic: v.string(),
        dayOrder: v.number(),
      }),
    ),
    curricula: v.array(
      v.object({ _id: v.id("curricula"), name: v.string(), group: groupValidator }),
    ),
    students: v.array(
      v.object({
        _id: v.id("students"),
        firstName: v.string(),
        lastName: v.string(),
        loginCode: v.string(),
        group: groupValidator,
        curriculumId: v.id("curricula"),
        sinceYear: v.string(),
        attendance: v.union(attendanceStatusValidator, v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const settings = await getSettings(ctx);

    const curricula = [
      ...(await ctx.db
        .query("curricula")
        .withIndex("by_group", (q) => q.eq("group", "basic"))
        .take(50)),
      ...(await ctx.db
        .query("curricula")
        .withIndex("by_group", (q) => q.eq("group", "advanced"))
        .take(50)),
    ];
    const groupCurricula = new Set(
      curricula.filter((c) => c.group === args.group).map((c) => c._id),
    );

    // Most recent lesson for this group that has started (or starts within the day).
    let attendanceLesson = null;
    const recent = await ctx.db
      .query("lessonSchedules")
      .withIndex("by_year_and_lessonAt", (q) =>
        q.eq("year", settings.currentYear).lte("lessonAt", args.now + LESSON_LOOKAHEAD_MS),
      )
      .order("desc")
      .take(50);
    for (const schedule of recent) {
      const day = await ctx.db.get("days", schedule.dayId);
      if (day && groupCurricula.has(day.curriculumId)) {
        attendanceLesson = {
          scheduleId: schedule._id,
          lessonAt: schedule.lessonAt,
          topic: day.topic,
          dayOrder: day.order,
        };
        break;
      }
    }

    const attendanceByStudent = new Map<Id<"students">, "present" | "late" | "absent">();
    if (attendanceLesson !== null) {
      const marks = await ctx.db
        .query("attendance")
        .withIndex("by_scheduleId_and_studentId", (q) =>
          q.eq("scheduleId", attendanceLesson.scheduleId),
        )
        .take(MAX_ROSTER);
      for (const mark of marks) attendanceByStudent.set(mark.studentId, mark.status);
    }

    const students = await ctx.db
      .query("students")
      .withIndex("by_group_and_lastName", (q) => q.eq("group", args.group))
      .take(MAX_ROSTER);

    return {
      year: settings.currentYear,
      timeZone: settings.timeZone,
      attendanceLesson,
      curricula: curricula.map((c) => ({ _id: c._id, name: c.name, group: c.group })),
      students: students.map((s) => ({
        _id: s._id,
        firstName: s.firstName,
        lastName: s.lastName,
        loginCode: s.loginCode,
        group: s.group,
        curriculumId: s.curriculumId,
        sinceYear: s.sinceYear,
        attendance: attendanceByStudent.get(s._id) ?? null,
      })),
    };
  },
});

export const markAttendance = mutation({
  args: {
    studentId: v.id("students"),
    scheduleId: v.id("lessonSchedules"),
    status: attendanceStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const student = await ctx.db.get("students", args.studentId);
    const schedule = await ctx.db.get("lessonSchedules", args.scheduleId);
    if (student === null || schedule === null) throw appError("NOT_FOUND", "Student or lesson not found.");
    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_scheduleId_and_studentId", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("studentId", args.studentId),
      )
      .unique();
    if (existing?.status === args.status) return null;
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("attendance", existing._id, {
        status: args.status,
        markedBy: userId,
        markedAt: now,
      });
    } else {
      await ctx.db.insert("attendance", { ...args, markedBy: userId, markedAt: now });
    }
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "attendance",
      recordId: args.studentId,
      summary: `Marked ${student.firstName} ${student.lastName} ${args.status}`,
      before: existing ? { status: existing.status } : undefined,
      after: { status: args.status, scheduleId: args.scheduleId },
    });
    return null;
  },
});

/**
 * Changes a student's login code, group and/or curriculum. Identity, saved
 * work, submissions and history stay attached to the same student id.
 */
export const updateStudent = mutation({
  args: {
    studentId: v.id("students"),
    loginCode: v.string(),
    group: groupValidator,
    curriculumId: v.id("curricula"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const student = await ctx.db.get("students", args.studentId);
    if (student === null) throw appError("NOT_FOUND", "Student not found.");
    const curriculum = await ctx.db.get("curricula", args.curriculumId);
    if (curriculum === null) throw appError("NOT_FOUND", "Curriculum not found.");
    if (curriculum.group !== args.group) {
      throw appError("INVALID", `${curriculum.name} belongs to the ${curriculum.group} group.`);
    }

    const loginCode = normalizeLoginCode(args.loginCode);
    if (loginCode.length < 2) throw appError("INVALID", "Login codes need at least 2 letters or digits.");
    if (loginCode !== student.loginCode) {
      const taken = await ctx.db
        .query("students")
        .withIndex("by_loginCode", (q) => q.eq("loginCode", loginCode))
        .first();
      if (taken !== null) {
        throw appError("CONFLICT", `“${loginCode}” is already used by another student.`);
      }
    }

    const before = {
      loginCode: student.loginCode,
      group: student.group,
      curriculumId: student.curriculumId,
    };
    const after = { loginCode, group: args.group, curriculumId: args.curriculumId };
    if (JSON.stringify(before) === JSON.stringify(after)) return null;
    await ctx.db.patch("students", student._id, after);
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "students",
      recordId: student._id,
      summary: `Updated ${student.firstName} ${student.lastName}`,
      before,
      after,
    });
    return null;
  },
});
