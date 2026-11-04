import { assignmentSummaries, dayValidator } from "./student";
import { classFor, classYear, writableClass, rememberEnrollment, transitionEnrollment } from "./lib/classes";
import { avatarColors, avatarColorValidator, studentAvatarColor } from "./lib/studentAvatars";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { getSettings, requireAdmin } from "./lib/access";
import { recordAdminChange } from "./lib/changes";
import { appError } from "./lib/errors";
import { allocateLoginCode, normalizeLoginCode } from "./lib/loginCodes";
import { api, internal } from "./_generated/api";
import { attendanceStatusValidator, groupValidator } from "./schema";

const MAX_ROSTER = 500;
/** How far after "now" a lesson still counts as today's for attendance. */
const LESSON_LOOKAHEAD_MS = 12 * 60 * 60 * 1000;

/**
 * Students in one group, with today's attendance. `now` comes from the client
 * (rounded to the minute) because queries must not read the wall clock.
 */
export const roster = query({
  args: { group: groupValidator, now: v.number(), scheduleId: v.optional(v.id("lessonSchedules")) },
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
    lessons: v.array(v.object({ scheduleId: v.id("lessonSchedules"), lessonAt: v.number(), topic: v.string(), dayOrder: v.number() })),
    curricula: v.array(
      v.object({ _id: v.id("curricula"), name: v.string(), group: groupValidator }),
    ),
    students: v.array(
      v.object({
        _id: v.id("students"),
        avatarColor: avatarColorValidator,
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

    const classroom = await classFor(ctx, args.group);
    const year = await classYear(ctx, args.group);
    const curricula = await ctx.db.query("curricula").take(500);
    const groupCurricula = new Set(
      curricula.filter((c) => c.group === args.group).map((c) => c._id),
    );

    // Most recent lesson for this group that has started (or starts within the day).
    let attendanceLesson = null;
    const recent = await ctx.db
      .query("lessonSchedules")
      .withIndex("by_year_and_lessonAt", (q) =>
        q.eq("year", year),
      )
      .order("desc")
      .take(200);
    const lessons = [];
    for (const schedule of recent) {
      const day = await ctx.db.get("days", schedule.dayId);
      if (day && groupCurricula.has(day.curriculumId)) {
        const lesson = {
          scheduleId: schedule._id,
          lessonAt: schedule.lessonAt,
          topic: day.topic,
          dayOrder: day.order,
        };
        lessons.push(lesson);
        if (args.scheduleId ? schedule._id === args.scheduleId : attendanceLesson === null && schedule.lessonAt <= args.now + LESSON_LOOKAHEAD_MS) attendanceLesson = lesson;
      }
    }

    if (args.scheduleId && attendanceLesson === null) throw appError("INVALID", "Choose a lesson in this group and school year.");
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

    let students = await ctx.db
      .query("students")
      .withIndex("by_group_and_deletedAt_and_lastName", (q) => q.eq("group", args.group).eq("deletedAt", undefined))
      .take(MAX_ROSTER);

    if (classroom) {
      const entries = await ctx.db.query("enrollments").withIndex("by_group", q => q.eq("group", args.group)).take(MAX_ROSTER);
      const people = await Promise.all(entries.map(async e => { const student = await ctx.db.get("students", e.studentId); return student && (classroom.status === "archived" || student.deletedAt === undefined) ? { ...student, group: e.group, curriculumId: e.curriculumId } : null; }));
      students = people.filter((s): s is NonNullable<typeof s> => s !== null).sort((a,b) => a.lastName.localeCompare(b.lastName));
    }

    return {
      year,
      timeZone: settings.timeZone,
      attendanceLesson,
      lessons,
      curricula: curricula.map((c) => ({ _id: c._id, name: c.name, group: c.group })),
      students: students.map((s) => ({
        _id: s._id,
        avatarColor: studentAvatarColor(s),
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

function studentName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 100) throw appError("INVALID", "Names must be 1–100 characters.");
  return name;
}

export const createStudent = mutation({
  args: {
    firstName: v.string(), lastName: v.string(), group: groupValidator,
    curriculumId: v.optional(v.id("curricula")), curriculumName: v.optional(v.string()),
  },
  returns: v.id("students"),
  handler: async (ctx, args) => {
    const { userId: actorId } = await requireAdmin(ctx);
    await writableClass(ctx, args.group);
    const firstName = studentName(args.firstName);
    const lastName = studentName(args.lastName);
    let curriculumId = args.curriculumId;
    if (curriculumId) {
      const curriculum = await ctx.db.get("curricula", curriculumId);
      if (!curriculum || curriculum.group !== args.group) throw appError("INVALID", "Choose a curriculum in this group.");
    } else {
      const existing = await ctx.db.query("curricula").withIndex("by_group", q => q.eq("group", args.group)).first();
      if (existing) throw appError("INVALID", "Choose an existing curriculum.");
      const name = studentName(args.curriculumName ?? "");
      curriculumId = await ctx.db.insert("curricula", { name, group: args.group });
      await recordAdminChange(ctx, { actorId, table: "curricula", recordId: curriculumId, summary: `Created ${name}`, after: { name, group: args.group } });
    }
    const loginCode = await allocateLoginCode(ctx, firstName, lastName);
    const userId = await ctx.db.insert("users", { name: `${firstName} ${lastName}`, role: "student" });
    const fields = { avatarColor: avatarColors[Math.floor(Math.random() * avatarColors.length)], firstName, lastName, loginCode, group: args.group, curriculumId, sinceYear: await classYear(ctx, args.group) };
    const id = await ctx.db.insert("students", { ...fields, userId });
    await rememberEnrollment(ctx, (await ctx.db.get("students", id))!);
    await recordAdminChange(ctx, { actorId, table: "students", recordId: id, summary: `Added ${firstName} ${lastName}`, after: fields });
    return id;
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
    if (student === null || student.deletedAt !== undefined || schedule === null) throw appError("NOT_FOUND", "Student or lesson not found.");
    const day = await ctx.db.get("days", schedule.dayId);
    const curriculum = day ? await ctx.db.get("curricula", day.curriculumId) : null;
    if (!curriculum) throw appError("INVALID", "This lesson belongs to another group.");
    const enrolled = await ctx.db.query("enrollments").withIndex("by_studentId_and_group", q => q.eq("studentId", student._id).eq("group", curriculum.group)).unique();
    if (curriculum.group !== student.group && (!enrolled || enrolled.year !== schedule.year)) throw appError("INVALID", "This lesson belongs to another group.");
    await writableClass(ctx, curriculum.group);
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
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    loginCode: v.string(),
    group: groupValidator,
    curriculumId: v.id("curricula"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const student = await ctx.db.get("students", args.studentId);
    if (student === null || student.deletedAt !== undefined) throw appError("NOT_FOUND", "Student not found.");
    await writableClass(ctx, student.group);
    await writableClass(ctx, args.group);
    await rememberEnrollment(ctx, student);
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

    const firstName = studentName(args.firstName ?? student.firstName);
    const lastName = studentName(args.lastName ?? student.lastName);
    const before = {
      firstName: student.firstName, lastName: student.lastName,
      loginCode: student.loginCode,
      group: student.group,
      curriculumId: student.curriculumId,
    };
    const after = { firstName, lastName, loginCode, group: args.group, curriculumId: args.curriculumId };
    if (JSON.stringify(before) === JSON.stringify(after)) return null;
    const placement = await transitionEnrollment(ctx, student, args.group, args.curriculumId);
    await ctx.db.patch("students", student._id, { firstName, lastName, loginCode });
    await ctx.db.patch("users", student.userId, { name: `${firstName} ${lastName}` });
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "students",
      recordId: student._id,
      summary: `Updated ${student.firstName} ${student.lastName}`,
      before: { ...before, seatIndex: student.seatIndex ?? null },
      after: { ...after, ...placement, seatIndex: placement.seatIndex ?? null },
    });
    return null;
  },
});


/** Saves one lesson's edited marks atomically; repeat saves update existing marks. */
export const saveAttendance = mutation({
  args: { scheduleId: v.id("lessonSchedules"), marks: v.array(v.object({ studentId: v.id("students"), status: attendanceStatusValidator })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!await ctx.db.get("lessonSchedules", args.scheduleId)) throw appError("NOT_FOUND", "Lesson not found.");
    if (args.marks.length > MAX_ROSTER || new Set(args.marks.map(m => m.studentId)).size !== args.marks.length) throw appError("INVALID", "Invalid attendance roster.");
    for (const mark of args.marks) await ctx.runMutation(api.adminStudents.markAttendance, { ...mark, scheduleId: args.scheduleId });
    return null;
  },
});

/** Removes a student from active rosters without destroying their historical work. */
export const deleteStudent = mutation({
  args: { studentId: v.id("students") },
  returns: v.null(),
  handler: async (ctx, { studentId }) => {
    const { userId: actorId } = await requireAdmin(ctx);
    const student = await ctx.db.get("students", studentId);
    if (!student) throw appError("NOT_FOUND", "Student not found.");
    if (student.deletedAt !== undefined) return null;
    await writableClass(ctx, student.group);
    const deletedAt = Date.now();
    await ctx.db.patch("students", studentId, { deletedAt, seatIndex: undefined });
    await recordAdminChange(ctx, { actorId, table: "students", recordId: studentId, summary: `Deleted ${student.firstName} ${student.lastName}`, before: { group: student.group, seatIndex: student.seatIndex ?? null }, after: { deletedAt } });
    await ctx.scheduler.runAfter(0, internal.adminStudents.closeDeletedStudentHelp, { studentId, actorId });
    return null;
  },
});

/** Bounded batches also handle students with many historical workspaces. */
export const closeDeletedStudentHelp = internalMutation({
  args: { studentId: v.id("students"), actorId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const student = await ctx.db.get("students", args.studentId);
    if (!student || student.deletedAt === undefined) return null;
    const help = await ctx.db.query("helpRequests").withIndex("by_studentId_and_status", q => q.eq("studentId", args.studentId).eq("status", "open")).take(100);
    for (const request of help) await ctx.db.patch("helpRequests", request._id, { status: "resolved", resolvedAt: Date.now(), resolvedBy: args.actorId });
    if (help.length === 100) await ctx.scheduler.runAfter(0, internal.adminStudents.closeDeletedStudentHelp, args);
    return null;
  },
});

/** Every camp lesson in the selected class, with one student's saved attendance. */
export const attendanceDays = query({
  args: { studentId: v.id("students"), group: groupValidator },
  returns: v.object({ timeZone: v.string(), days: v.array(v.object({
    dayId: v.id("days"), order: v.number(), topic: v.string(),
    lessonAt: v.union(v.number(), v.null()), status: v.union(attendanceStatusValidator, v.null()),
  })) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw appError("NOT_FOUND", "Student not found.");
    const settings = await getSettings(ctx);
    const year = await classYear(ctx, args.group);
    const curriculum = await ctx.db.query("curricula").withIndex("by_group", q => q.eq("group", args.group)).order("desc").first();
    const lessons = curriculum ? await ctx.db.query("days").withIndex("by_curriculumId_and_order", q => q.eq("curriculumId", curriculum._id)).take(100) : [];
    const days = await Promise.all(lessons.map(async day => {
      const schedule = await ctx.db.query("lessonSchedules").withIndex("by_dayId_and_year", q => q.eq("dayId", day._id).eq("year", year)).unique();
      const mark = schedule ? await ctx.db.query("attendance").withIndex("by_scheduleId_and_studentId", q => q.eq("scheduleId", schedule._id).eq("studentId", student._id)).unique() : null;
      return { dayId: day._id, order: day.order, topic: day.topic, lessonAt: schedule?.lessonAt ?? null, status: mark?.status ?? null };
    }));
    return { timeZone: settings.timeZone, days };
  },
});

/** Current class progress for an admin inspecting a student. */
export const studentProgress = query({
  args: { studentId: v.id("students") },
  returns: v.object({ className: v.string(), year: v.string(), timeZone: v.string(), days: v.array(dayValidator) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw appError("NOT_FOUND", "Student not found.");
    const classroom = await classFor(ctx, student.group);
    const year = await classYear(ctx, student.group);
    const settings = await getSettings(ctx);
    const curriculum = classroom
      ? await ctx.db.query("curricula").withIndex("by_group", q => q.eq("group", student.group)).order("desc").first()
      : await ctx.db.get("curricula", student.curriculumId);
    const lessons = curriculum && (!classroom || classroom.status === "current")
      ? await ctx.db.query("days").withIndex("by_curriculumId_and_order", q => q.eq("curriculumId", curriculum._id)).take(100) : [];
    const days = await Promise.all(lessons.map(async day => {
      const schedule = await ctx.db.query("lessonSchedules").withIndex("by_dayId_and_year", q => q.eq("dayId", day._id).eq("year", year)).unique();
      return { _id: day._id, order: day.order, topic: day.topic, lessonAt: schedule?.lessonAt ?? null, assignments: await assignmentSummaries(ctx, student, day._id) };
    }));
    return { className: classroom?.name ?? (student.group === "basic" ? "Basic" : "Advanced"), year, timeZone: settings.timeZone, days };
  },
});
