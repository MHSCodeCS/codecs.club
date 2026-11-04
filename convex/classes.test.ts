import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { setupConvex } from "./test.setup";
async function setup() {
  const t = setupConvex();
  const adminId = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { role: "admin" });
    await ctx.db.insert("admins", { userId, username: "teacher", displayName: "Teacher" });
    await ctx.db.insert("settings", { currentYear: "2026-27", turnInDays: 14, closeTime: "23:59", timeZone: "America/Chicago" });
    return userId;
  });
  const admin = t.withIdentity({ subject: `${adminId}|session` });
  await admin.mutation(api.classes.initialize, {});
  const id = await admin.mutation(api.classes.create, { name: "Python", year: "2026-27", upcoming: false });
  const curriculum = (await admin.query(api.adminAssignments.catalog, { group: id }))[0];
  const studentId = await admin.mutation(api.adminStudents.createStudent, { firstName: "Ada", lastName: "Lovelace", group: id, curriculumId: curriculum._id });
  return { t, admin, id, curriculum, studentId };
}
test("class creation is admin-only, validates fields and owns a separate curriculum", async () => {
  const { t, admin, id, curriculum } = await setup();
  await expect(t.mutation(api.classes.create, { name: "Other", year: "2027-28", upcoming: true })).rejects.toThrow(/Sign in/);
  await expect(admin.mutation(api.classes.create, { name: " ", year: "2027-28", upcoming: true })).rejects.toThrow(/class name/);
  await expect(admin.mutation(api.classes.create, { name: "Other", year: "2027-30", upcoming: true })).rejects.toThrow(/year/);
  const other = await admin.mutation(api.classes.create, { name: "Python", year: "2027-28", upcoming: true });
  expect((await admin.query(api.adminAssignments.catalog, { group: other }))[0]._id).not.toBe(curriculum._id);
  expect((await admin.query(api.classes.list, {})).find(c => c._id === id)).toMatchObject({ name: "Python", year: "2026-27", status: "current" });
});
test("future enrollment preserves current placement; starting the class preserves previous participation", async () => {
  const { t, admin, id, studentId } = await setup();
  const future = await admin.mutation(api.classes.create, { name: "Next year", year: "2027-28", upcoming: true });
  await admin.mutation(api.classes.enroll, { studentId, group: future });
  await admin.mutation(api.classes.enroll, { studentId, group: future });
  expect(await t.run(ctx => ctx.db.get("students", studentId))).toMatchObject({ group: id });
  expect((await admin.query(api.adminStudents.roster, { group: future, now: 0 })).students).toHaveLength(1);
  await admin.mutation(api.classes.setStatus, { classId: id, status: "archived" });
  await admin.mutation(api.classes.setStatus, { classId: future, status: "current" });
  expect(await t.run(ctx => ctx.db.get("students", studentId))).toMatchObject({ group: future });
  expect((await admin.query(api.adminStudents.roster, { group: id, now: 0 })).students).toHaveLength(1);
  expect(await admin.query(api.classes.studentHistory, { studentId })).toEqual(expect.arrayContaining([expect.objectContaining({ group: id, status: "archived", year: "2026-27" }), expect.objectContaining({ group: future, year: "2027-28" })]));
});
test("upcoming schedules use their class year and archives reject all curriculum and enrollment changes", async () => {
  const { admin, studentId } = await setup();
  const id = await admin.mutation(api.classes.create, { name: "Future", year: "2028-29", upcoming: true });
  const curriculum = (await admin.query(api.adminAssignments.catalog, { group: id }))[0];
  await admin.mutation(api.adminCurriculum.addLesson, { curriculumId: curriculum._id, topic: "Loops", date: "2028-10-01", time: "10:00" });
  const overview = await admin.query(api.adminCurriculum.overview, { group: id });
  expect(overview.year).toBe("2028-29");
  expect(overview.days[0].schedule).not.toBeNull();
  await admin.mutation(api.classes.setStatus, { classId: id, status: "archived" });
  await expect(admin.mutation(api.classes.enroll, { studentId, group: id })).rejects.toThrow(/read-only/);
  await expect(admin.mutation(api.classes.setStatus, { classId: id, status: "current" })).rejects.toThrow(/read-only/);
  await expect(admin.mutation(api.adminCurriculum.updateDayContent, { dayId: overview.days[0]._id, topic: "Changed", slidesUrl: "" })).rejects.toThrow(/read-only/);
  await expect(admin.mutation(api.adminCurriculum.addLesson, { curriculumId: curriculum._id, topic: "Changed", date: "2028-10-02", time: "10:00" })).rejects.toThrow(/read-only/);
  await expect(admin.mutation(api.adminCurriculum.setSchedule, { dayId: overview.days[0]._id, year: "2028-29", date: "2028-10-02", time: "10:00" })).rejects.toThrow(/read-only/);
});
test("archived workspace edits, reviews and turn-ins are refused; historical files remain readable", async () => {
  const { t, admin, id, studentId, curriculum } = await setup();
  const scheduleId = await admin.mutation(api.adminCurriculum.addLesson, { curriculumId: curriculum._id, topic: "Loops", date: "2026-10-01", time: "10:00" });
  const schedule = (await t.run(ctx => ctx.db.get("lessonSchedules", scheduleId)))!;
  const assignment = await admin.mutation(api.adminAssignments.save, { dayId: schedule.dayId, baseRevisionId: null, publish: true, content: { title: "Practice", type: "open", summary: "", instructions: "Write Python", expectedOutput: "", starterFiles: [{ name: "main.py", content: "" }], parts: [], partialMin: 0, loopCheck: false, checkInput: "" } });
  const person = (await t.run(ctx => ctx.db.get("students", studentId)))!;
  const student = t.withIdentity({ subject: `${person.userId}|session` });
  const workspaceId = await student.mutation(api.workspaces.open, { assignmentId: assignment.assignmentId });
  await admin.mutation(api.classes.setStatus, { classId: id, status: "archived" });
  expect((await student.query(api.workspaces.get, { assignmentId: assignment.assignmentId }))?.archived).toBe(true);
  await expect(student.mutation(api.workspaces.setPackages, { workspaceId, packages: [] })).rejects.toThrow(/read-only/);
  await expect(student.mutation(api.submissions.turnIn, { workspaceId, idempotencyKey: "archive-test" })).rejects.toThrow(/read-only/);
  await expect(admin.mutation(api.adminStudents.markAttendance, { studentId, scheduleId, status: "present" })).rejects.toThrow(/read-only/);
  expect((await student.query(api.student.home, {})).days).toEqual([]);
});
test("changing a class in the same year replaces enrollment, while returning students keep identity", async () => {
  const { t, admin, id, studentId } = await setup();
  const other = await admin.mutation(api.classes.create, { name: "Other", year: "2026-27", upcoming: false });
  const person = (await t.run(ctx => ctx.db.get("students", studentId)))!;
  await admin.mutation(api.classes.enrollByCode, { loginCode: person.loginCode.toUpperCase(), group: other });
  expect((await admin.query(api.adminStudents.roster, { group: id, now: 0 })).students).toEqual([]);
  expect((await admin.query(api.adminStudents.roster, { group: other, now: 0 })).students[0]._id).toBe(studentId);
  expect(await t.run(ctx => ctx.db.get("students", studentId))).toMatchObject({ userId: person.userId, loginCode: person.loginCode });
  await admin.mutation(api.classes.initialize, {});
  expect((await admin.query(api.classes.list, {})).filter(c => c.group === "basic")).toHaveLength(1);
});

test("lesson import copies archived lessons and assignment drafts independently, without schedules or duplicates", async () => {
  const { t, admin, id, curriculum } = await setup();
  const scheduleId = await admin.mutation(api.adminCurriculum.addLesson, { curriculumId: curriculum._id, topic: "Loops", date: "2026-10-01", time: "10:00" });
  const schedule = (await t.run(ctx => ctx.db.get("lessonSchedules", scheduleId)))!;
  const original = await admin.mutation(api.adminAssignments.save, { dayId: schedule.dayId, baseRevisionId: null, publish: true, content: { title: "Practice", type: "open", summary: "Summary", instructions: "Write Python", expectedOutput: "", starterFiles: [{ name: "main.py", content: "" }], parts: [], partialMin: 0, loopCheck: false, checkInput: "" } });
  await admin.mutation(api.classes.setStatus, { classId: id, status: "archived" });
  const target = await admin.mutation(api.classes.create, { name: "Next", year: "2027-28", upcoming: true });
  const args = { group: target, sourceGroup: id, dayIds: [schedule.dayId] };
  await expect(t.mutation(api.adminCurriculum.importLessons, args)).rejects.toThrow(/Sign in/);
  expect(await admin.mutation(api.adminCurriculum.importLessons, args)).toEqual({ imported: 1, skipped: 0 });
  expect(await admin.mutation(api.adminCurriculum.importLessons, args)).toEqual({ imported: 0, skipped: 1 });
  const copy = (await admin.query(api.adminCurriculum.overview, { group: target })).days[0];
  expect(copy._id).not.toBe(schedule.dayId);
  expect(copy.schedule).toBeNull();
  expect(copy.assignments[0]).toMatchObject({ title: "Practice", status: "draft" });
  const copiedAssignment = await admin.query(api.adminAssignments.get, { assignmentId: copy.assignments[0]._id });
  expect(copiedAssignment?.revision?.instructions).toBe("Write Python");
  expect(copiedAssignment?.revision?._id).not.toBe(original.revisionId);
  await admin.mutation(api.adminCurriculum.updateDayContent, { dayId: copy._id, topic: "Changed copy", slidesUrl: "" });
  expect((await admin.query(api.adminCurriculum.overview, { group: id })).days[0].topic).toBe("Loops");
  await expect(admin.mutation(api.adminCurriculum.importLessons, { ...args, group: id, sourceGroup: target, dayIds: [copy._id] })).rejects.toThrow(/read-only/);
  await expect(admin.mutation(api.adminCurriculum.importLessons, { ...args, sourceGroup: target })).rejects.toThrow(/different/);
});

test("student lookup includes removed identities, and restoration reuses the login and historical enrollment", async () => {
  const { t, admin, id, studentId } = await setup();
  const original = (await t.run(ctx => ctx.db.get("students", studentId)))!;
  await admin.mutation(api.adminStudents.deleteStudent, { studentId });
  await admin.mutation(api.classes.setStatus, { classId: id, status: "archived" });
  const target = await admin.mutation(api.classes.create, { name: "Returning", year: "2027-28", upcoming: false });
  await expect(t.query(api.classes.findStudents, { search: "Ada", group: target })).rejects.toThrow(/Sign in/);
  const results = await admin.query(api.classes.findStudents, { search: "ada love", group: target });
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ _id: studentId, removed: true, enrolled: false });
  expect((await admin.query(api.classes.findStudents, { search: original.loginCode, group: target }))[0]._id).toBe(studentId);
  await expect(admin.mutation(api.classes.enroll, { studentId, group: target })).rejects.toThrow(/Restore and add/);
  await admin.mutation(api.classes.enroll, { studentId, group: target, restore: true });
  expect(await t.run(ctx => ctx.db.get("students", studentId))).toMatchObject({ userId: original.userId, loginCode: original.loginCode, group: target });
  expect((await t.run(ctx => ctx.db.get("students", studentId)))?.deletedAt).toBeUndefined();
  expect((await admin.query(api.adminStudents.roster, { group: id, now: 0 })).students[0]._id).toBe(studentId);
  expect((await admin.query(api.classes.findStudents, { search: "Ada", group: target }))[0].enrolled).toBe(true);
});

test("only admins can delete archives, and deleting retains student involvement and lessons", async () => {
  const { t, admin, id, studentId, curriculum } = await setup();
  const args = { classId: id };
  const student = (await t.run(ctx => ctx.db.get("students", studentId)))!;
  const caller = t.withIdentity({ subject: `${student.userId}|session` });
  await expect(t.mutation(api.classes.deleteArchived, args)).rejects.toThrow(/Sign in/);
  await expect(caller.mutation(api.classes.deleteArchived, args)).rejects.toThrow(/Only admins/);
  await expect(admin.mutation(api.classes.deleteArchived, args)).rejects.toThrow(/Only archived/);
  const upcoming = await admin.mutation(api.classes.create, { name: "Future", year: "2027-28", upcoming: true });
  await expect(admin.mutation(api.classes.deleteArchived, { classId: upcoming })).rejects.toThrow(/Only archived/);
  const scheduleId = await admin.mutation(api.adminCurriculum.addLesson, { curriculumId: curriculum._id, topic: "Loops", date: "2026-10-01", time: "10:00" });
  await admin.mutation(api.classes.setStatus, { classId: id, status: "archived" });
  await admin.mutation(api.classes.deleteArchived, args);
  await admin.mutation(api.classes.deleteArchived, args);
  expect((await admin.query(api.classes.list, {})).some(c => c._id === id)).toBe(false);
  expect((await admin.query(api.classes.studentHistory, { studentId }))[0]).toMatchObject({ name: "Python", year: "2026-27", status: "archived" });
  expect(await t.run(ctx => ctx.db.get("students", studentId))).toMatchObject({ userId: student.userId, loginCode: student.loginCode });
  expect(await t.run(ctx => ctx.db.get("lessonSchedules", scheduleId))).not.toBeNull();
  expect((await t.run(ctx => ctx.db.get("classes", id)))?.deletedAt).toEqual(expect.any(Number));
  expect((await t.run(ctx => ctx.db.query("adminChanges").withIndex("by_recordId_and_at", q => q.eq("recordId", id)).take(20))).filter(c => c.summary.startsWith("Deleted archived class"))).toHaveLength(1);
});

test("student lessons and assignments follow the current class curriculum and schedule year", async () => {
  const { t, admin, id, studentId, curriculum } = await setup();
  const person = (await t.run(ctx => ctx.db.get("students", studentId)))!;
  const student = t.withIdentity({ subject: `${person.userId}|session` });
  const latest = await t.run(async ctx => {
    await ctx.db.patch("settings", (await ctx.db.query("settings").first())!._id, { currentYear: "2030-31" });
    return await ctx.db.insert("curricula", { group: id, name: "Current class lessons" });
  });
  const scheduleId = await admin.mutation(api.adminCurriculum.addLesson, { curriculumId: latest, topic: "Current lesson", date: "2026-10-28", time: "10:00" });
  const schedule = (await t.run(ctx => ctx.db.get("lessonSchedules", scheduleId)))!;
  const published = await admin.mutation(api.adminAssignments.save, { dayId: schedule.dayId, baseRevisionId: null, publish: true, content: { title: "Current practice", type: "open", summary: "", instructions: "Write Python", expectedOutput: "", starterFiles: [{ name: "main.py", content: "" }], parts: [], partialMin: 0, loopCheck: false, checkInput: "" } });
  const oldDay = await t.run(ctx => ctx.db.insert("days", { curriculumId: curriculum._id, order: 1, topic: "Previous curriculum" }));
  const home = await student.query(api.student.home, {});
  expect(home).toMatchObject({ className: "Python", year: "2026-27", curriculum: { _id: latest } });
  expect(home.days).toHaveLength(1);
  expect(home.days[0]).toMatchObject({ _id: schedule.dayId, lessonAt: schedule.lessonAt });
  expect(home.days[0].assignments[0]._id).toBe(published.assignmentId);
  expect(await student.query(api.student.day, { dayId: oldDay })).toBeNull();
  expect((await student.query(api.student.day, { dayId: schedule.dayId }))?.day.lessonAt).toBe(schedule.lessonAt);
  await expect(student.mutation(api.workspaces.open, { assignmentId: published.assignmentId })).resolves.toBeTruthy();
  const future = await admin.mutation(api.classes.create, { name: "Future", year: "2027-28", upcoming: true });
  await admin.mutation(api.classes.enroll, { studentId, group: future });
  expect((await student.query(api.student.home, {})).curriculum._id).toBe(latest);
  await admin.mutation(api.classes.setStatus, { classId: future, status: "current" });
  expect((await student.query(api.student.home, {})).className).toBe("Future");
  expect(await student.query(api.student.day, { dayId: schedule.dayId })).toBeNull();
});
