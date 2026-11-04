import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvex } from "./test.setup";

async function setup() {
  const t = setupConvex();
  const adminId = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { name: "Teacher", role: "admin" });
    await ctx.db.insert("admins", { userId, username: "teacher", displayName: "Teacher" });
    await ctx.db.insert("settings", { currentYear: "2026-27", turnInDays: 14, closeTime: "23:59", timeZone: "America/Chicago" });
    return userId;
  });
  return { t, admin: t.withIdentity({ subject: `${adminId}|test-session` }) };
}
const input = { firstName: " Ada ", lastName: "Lovelace", group: "basic" as const, curriculumName: "Python" };

test("creation is admin-only and invalid names leave no records", async () => {
  const { t, admin } = await setup();
  await expect(t.mutation(api.adminStudents.createStudent, input)).rejects.toThrow(/Sign in/);
  await expect(admin.mutation(api.adminStudents.createStudent, { ...input, firstName: " " })).rejects.toThrow(/Names/);
  expect(await t.run(ctx => ctx.db.query("students").take(2))).toEqual([]);
});

test("creates persistent identities, unique codes and history; name edits retain identity", async () => {
  const { t, admin } = await setup();
  const id = await admin.mutation(api.adminStudents.createStudent, input);
  const student = (await t.run(ctx => ctx.db.get("students", id)))!;
  expect(student).toMatchObject({ firstName: "Ada", loginCode: "alovelace", sinceYear: "2026-27" });
  const secondId = await admin.mutation(api.adminStudents.createStudent, { ...input, curriculumName: undefined, curriculumId: student.curriculumId });
  expect(await t.run(ctx => ctx.db.get("students", secondId))).toMatchObject({ loginCode: "alovelace1" });
  const asStudent = t.withIdentity({ subject: `${student.userId}|test-session` });
  await expect(asStudent.mutation(api.adminStudents.createStudent, input)).rejects.toThrow(/Only admins/);
  await admin.mutation(api.adminStudents.updateStudent, { studentId: id, firstName: "Augusta", lastName: "King", loginCode: student.loginCode, group: "basic", curriculumId: student.curriculumId });
  expect(await t.run(ctx => ctx.db.get("students", id))).toMatchObject({ userId: student.userId, firstName: "Augusta", loginCode: "alovelace" });
  expect(await t.run(ctx => ctx.db.get("users", student.userId))).toMatchObject({ name: "Augusta King" });
  expect((await t.run(ctx => ctx.db.query("adminChanges").withIndex("by_recordId_and_at", q => q.eq("recordId", id)).take(10))).length).toBe(2);
  await expect(admin.mutation(api.adminStudents.createStudent, { ...input, group: "advanced", curriculumId: student.curriculumId })).rejects.toThrow(/curriculum/);
});

test("attendance saves per lesson, survives reload and records history", async () => {
  const { t, admin } = await setup();
  const id = await admin.mutation(api.adminStudents.createStudent, input);
  const student = (await t.run(ctx => ctx.db.get("students", id)))!;
  const args = { curriculumId: student.curriculumId, topic: "Variables", date: "2026-10-27", time: "16:00" };
  await expect(t.mutation(api.adminCurriculum.addLesson, args)).rejects.toThrow(/Sign in/);
  await expect(admin.mutation(api.adminCurriculum.addLesson, { ...args, date: "2026-02-30" })).rejects.toThrow(/valid date/);
  const lesson = await admin.mutation(api.adminCurriculum.addLesson, args);
  const next = await admin.mutation(api.adminCurriculum.addLesson, { ...args, topic: "Loops", date: "2026-11-03" });
  const mark = { studentId: id, scheduleId: lesson, status: "present" as const };
  const asStudent = t.withIdentity({ subject: `${student.userId}|test-session` });
  await expect(asStudent.mutation(api.adminStudents.markAttendance, mark)).rejects.toThrow(/Only admins/);
  await admin.mutation(api.adminStudents.markAttendance, mark);
  await admin.mutation(api.adminStudents.markAttendance, { ...mark, status: "late" });
  await admin.mutation(api.adminStudents.markAttendance, { ...mark, status: "late" });
  const roster = await admin.query(api.adminStudents.roster, { group: "basic", now: Date.now(), scheduleId: lesson });
  expect(roster.students[0].attendance).toBe("late");
  expect(roster.lessons).toHaveLength(2);
  expect((await admin.query(api.adminStudents.roster, { group: "basic", now: Date.now(), scheduleId: next })).students[0].attendance).toBeNull();
  expect(await t.run(ctx => ctx.db.query("attendance").take(10))).toHaveLength(1);
  const advancedId = await admin.mutation(api.adminStudents.createStudent, { ...input, group: "advanced", curriculumName: "Advanced" });
  await expect(admin.mutation(api.adminStudents.markAttendance, { ...mark, studentId: advancedId })).rejects.toThrow(/another group/);
  await expect(admin.query(api.adminStudents.roster, { group: "advanced", now: Date.now(), scheduleId: lesson })).rejects.toThrow(/Choose a lesson/);
});

test("explicit attendance saves update the same lesson repeatedly and roll back invalid batches", async () => {
  const { t, admin } = await setup();
  const id = await admin.mutation(api.adminStudents.createStudent, input);
  const student = (await t.run(ctx => ctx.db.get("students", id)))!;
  const scheduleId = await admin.mutation(api.adminCurriculum.addLesson, { curriculumId: student.curriculumId, topic: "Loops", date: "2026-10-27", time: "16:00" });
  const first = { scheduleId, marks: [{ studentId: id, status: "present" as const }] };
  await expect(t.mutation(api.adminStudents.saveAttendance, first)).rejects.toThrow(/Sign in/);
  await admin.mutation(api.adminStudents.saveAttendance, first);
  await admin.mutation(api.adminStudents.saveAttendance, { scheduleId, marks: [{ studentId: id, status: "absent" }] });
  await admin.mutation(api.adminStudents.saveAttendance, { scheduleId, marks: [] });
  expect(await t.run(ctx => ctx.db.query("attendance").take(10))).toMatchObject([{ status: "absent" }]);
  const advancedId = await admin.mutation(api.adminStudents.createStudent, { ...input, group: "advanced", curriculumName: "Advanced" });
  await expect(admin.mutation(api.adminStudents.saveAttendance, { scheduleId, marks: [{ studentId: id, status: "late" }, { studentId: advancedId, status: "present" }] })).rejects.toThrow(/another group/);
  expect(await t.run(ctx => ctx.db.query("attendance").take(10))).toMatchObject([{ status: "absent" }]);
});

test("lesson end times use the school zone, validate order and persist edits", async () => {
  const { t, admin } = await setup();
  const id = await admin.mutation(api.adminStudents.createStudent, input);
  const student = (await t.run(ctx => ctx.db.get("students", id)))!;
  const args = { curriculumId: student.curriculumId, topic: "Functions", date: "2026-10-27", time: "16:00", endTime: "17:30" };
  await expect(admin.mutation(api.adminCurriculum.addLesson, { ...args, endTime: "15:00" })).rejects.toThrow(/after the start/);
  await expect(admin.mutation(api.adminCurriculum.addLesson, { ...args, endTime: "25:00" })).rejects.toThrow(/valid end time/);
  const scheduleId = await admin.mutation(api.adminCurriculum.addLesson, args);
  const schedule = (await t.run(ctx => ctx.db.get("lessonSchedules", scheduleId)))!;
  expect(schedule.endsAt! - schedule.lessonAt).toBe(90 * 60 * 1000);
  await admin.mutation(api.adminCurriculum.setSchedule, { dayId: schedule.dayId, year: "2026-27", date: args.date, time: args.time, endTime: "18:00" });
  const updated = (await t.run(ctx => ctx.db.get("lessonSchedules", scheduleId)))!;
  expect(updated.endsAt! - updated.lessonAt).toBe(2 * 60 * 60 * 1000);
  expect(updated.turnInClosesAt).toBe(schedule.turnInClosesAt);
  const overview = await admin.query(api.adminCurriculum.overview, { group: "basic" });
  expect(overview.days[0].schedule?.endsAt).toBe(updated.endsAt);
});

test("student avatar color is assigned once and survives edits and migration reruns", async () => {
  const { t, admin } = await setup();
  const id = await admin.mutation(api.adminStudents.createStudent, input);
  const student = (await t.run(ctx => ctx.db.get("students", id)))!;
  expect(student.avatarColor).toMatch(/^#[0-9a-f]{6}$/);
  await admin.mutation(api.adminStudents.updateStudent, { studentId: id, firstName: "New", lastName: "Name", loginCode: "newcode", group: "basic", curriculumId: student.curriculumId });
  const { internal } = await import("./_generated/api");
  await t.mutation(internal.studentAvatarMigration.assign, {});
  expect((await t.run(ctx => ctx.db.get("students", id)))?.avatarColor).toBe(student.avatarColor);
  const roster = await admin.query(api.adminStudents.roster, { group: "basic", now: Date.now() });
  expect(roster.students[0].avatarColor).toBe(student.avatarColor);
  const asStudent = t.withIdentity({ subject: `${student.userId}|test-session` });
  expect(await asStudent.query(api.viewer.current, {})).toMatchObject({ avatarColor: student.avatarColor });
  await t.run(ctx => ctx.db.patch("students", id, { avatarColor: undefined }));
  const legacy = (await admin.query(api.adminStudents.roster, { group: "basic", now: Date.now() })).students[0].avatarColor;
  await t.mutation(internal.studentAvatarMigration.assign, {});
  await t.mutation(internal.studentAvatarMigration.assign, {});
  expect((await t.run(ctx => ctx.db.get("students", id)))?.avatarColor).toBe(legacy);
});

test("deleting a student removes active access and seating but preserves work and history", async () => {
  const { t, admin } = await setup();
  const id = await admin.mutation(api.adminStudents.createStudent, input);
  const student = (await t.run(ctx => ctx.db.get("students", id)))!;
  const asStudent = t.withIdentity({ subject: `${student.userId}|test-session` });
  const lessonId = await admin.mutation(api.adminCurriculum.addLesson, { curriculumId: student.curriculumId, topic: "Loops", date: "2026-10-27", time: "16:00" });
  await admin.mutation(api.adminStudents.markAttendance, { studentId: id, scheduleId: lessonId, status: "present" });
  await admin.mutation(api.assistance.setSeat, { studentId: id, seatIndex: 0 });
  const workspaceId = await t.run(async ctx => {
    const dayId = await ctx.db.insert("days", { curriculumId: student.curriculumId, order: 2, topic: "Practice" });
    const assignmentId = await ctx.db.insert("assignments", { dayId, order: 1, title: "Practice", type: "open", status: "published" });
    const workspaceId = await ctx.db.insert("workspaces", { studentId: id, assignmentId, curriculumId: student.curriculumId, year: "2026-27", group: "basic", latestVersion: 1, updatedAt: Date.now() });
    await ctx.db.insert("workFiles", { workspaceId, name: "main.py", content: "print(1)", updatedAt: Date.now(), updatedBy: student.userId });
    await ctx.db.insert("helpRequests", { studentId: id, workspaceId, status: "open", createdAt: Date.now() });
    return workspaceId;
  });
  const before = await admin.query(api.classroomLayouts.get, { group: "basic" });
  await expect(t.mutation(api.adminStudents.deleteStudent, { studentId: id })).rejects.toThrow(/Sign in/);
  await expect(asStudent.mutation(api.adminStudents.deleteStudent, { studentId: id })).rejects.toThrow(/Only admins/);
  await admin.mutation(api.adminStudents.deleteStudent, { studentId: id });
  await admin.mutation(api.adminStudents.deleteStudent, { studentId: id });
  expect((await t.run(ctx => ctx.db.get("students", id)))?.deletedAt).toBeTypeOf("number");
  expect((await t.run(ctx => ctx.db.get("students", id)))?.seatIndex).toBeUndefined();
  expect((await admin.query(api.adminStudents.roster, { group: "basic", now: Date.now() })).students).toEqual([]);
  expect((await admin.query(api.assistance.classroom, { group: "basic" })).students).toEqual([]);
  expect((await admin.query(api.classroomLayouts.get, { group: "basic" })).seating).toEqual([]);
  expect(await asStudent.query(api.viewer.current, {})).toBeNull();
  expect(await t.query(internal.students.userIdForLoginCode, { loginCode: student.loginCode })).toBeNull();
  await expect(asStudent.query(api.myWork.list, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow();
  await expect(asStudent.query(api.assistance.detail, { workspaceId })).rejects.toThrow();
  await expect(admin.mutation(api.classroomLayouts.save, { ...before, group: "basic" })).rejects.toThrow(/changed/);
  expect(await t.run(ctx => ctx.db.get("workspaces", workspaceId))).not.toBeNull();
  expect(await t.run(ctx => ctx.db.query("attendance").withIndex("by_studentId", q => q.eq("studentId", id)).take(10))).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("adminChanges").withIndex("by_recordId_and_at", q => q.eq("recordId", id)).take(10))).toEqual(expect.arrayContaining([expect.objectContaining({ summary: "Deleted Ada Lovelace" })]));
  await t.finishAllScheduledFunctions(() => {});
  expect((await admin.query(api.adminNav.badges, {})).openHelp).toBe(0);
});

test("camp attendance cards include every day and isolate student, class and schedule year", async () => {
  const { t, admin } = await setup();
  const studentId = await admin.mutation(api.adminStudents.createStudent, input);
  const student = (await t.run(ctx => ctx.db.get("students", studentId)))!;
  const other = await admin.mutation(api.adminStudents.createStudent, { ...input, firstName: "Other", curriculumId: student.curriculumId, curriculumName: undefined });
  const schedules: import("./_generated/dataModel").Id<"lessonSchedules">[] = [];
  for (const topic of ["Present day", "Late day", "Absent day", "Unmarked day"]) {
    schedules.push(await admin.mutation(api.adminCurriculum.addLesson, { curriculumId: student.curriculumId, topic, date: "2026-10-27", time: "10:00" }));
  }
  for (const [index, status] of (["present", "late", "absent"] as const).entries()) {
    await admin.mutation(api.adminStudents.markAttendance, { studentId, scheduleId: schedules[index], status });
  }
  await admin.mutation(api.adminStudents.markAttendance, { studentId: other, scheduleId: schedules[3], status: "present" });
  await t.run(async ctx => {
    await ctx.db.insert("days", { curriculumId: student.curriculumId, order: 5, topic: "Unscheduled day" });
    const day = (await ctx.db.get("lessonSchedules", schedules[0]))!;
    const old = await ctx.db.insert("lessonSchedules", { dayId: day.dayId, year: "2025-26", lessonAt: 1, turnInClosesAt: 2 });
    await ctx.db.insert("attendance", { studentId, scheduleId: old, status: "absent", markedAt: 1, markedBy: student.userId });
  });
  const args = { studentId, group: "basic" };
  await expect(t.query(api.adminStudents.attendanceDays, args)).rejects.toThrow(/Sign in/);
  await expect(t.withIdentity({ subject: `${student.userId}|test` }).query(api.adminStudents.attendanceDays, args)).rejects.toThrow(/Only admins/);
  const result = await admin.query(api.adminStudents.attendanceDays, args);
  expect(result.days.map(d => d.status)).toEqual(["present", "late", "absent", null, null]);
  expect(result.days[4].lessonAt).toBeNull();
  expect((await admin.query(api.adminStudents.attendanceDays, { studentId, group: "advanced" })).days).toEqual([]);
});

test("admin progress matches the student's learning home and requires admin access", async () => {
  const { t, admin } = await setup();
  const studentId = await admin.mutation(api.adminStudents.createStudent, input);
  const person = (await t.run(ctx => ctx.db.get("students", studentId)))!;
  const student = t.withIdentity({ subject: `${person.userId}|test` });
  await admin.mutation(api.adminCurriculum.addLesson, { curriculumId: person.curriculumId, topic: "Loops", date: "2026-10-28", time: "10:00" });
  const args = { studentId };
  await expect(t.query(api.adminStudents.studentProgress, args)).rejects.toThrow(/Sign in/);
  await expect(student.query(api.adminStudents.studentProgress, args)).rejects.toThrow(/Only admins/);
  const progress = await admin.query(api.adminStudents.studentProgress, args);
  const home = await student.query(api.student.home, {});
  expect(progress).toMatchObject({ className: home.className, year: home.year, timeZone: home.timeZone, days: home.days });
});
