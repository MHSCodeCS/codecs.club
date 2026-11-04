import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { setupConvex } from "./test.setup";

async function setup() {
  const t = setupConvex();
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { role: "admin" });
    await ctx.db.insert("admins", { userId, username: "teacher", displayName: "Teacher" });
    const curriculumId = await ctx.db.insert("curricula", { group: "basic", name: "Python" });
    const dayId = await ctx.db.insert("days", { curriculumId, topic: "Loops", order: 1 });
    const keptDayId = await ctx.db.insert("days", { curriculumId, topic: "Functions", order: 2 });
    const assignmentId = await ctx.db.insert("assignments", { dayId, order: 1, type: "open", title: "Practice", status: "draft" });
    const revisionId = await ctx.db.insert("assignmentRevisions", { assignmentId, instructions: "", summary: "", starterFiles: [], parts: [], partialMin: 0, loopCheck: false, createdBy: userId, createdAt: 1 });
    const scheduleId = await ctx.db.insert("lessonSchedules", { dayId, year: "2026-27", lessonAt: 1, turnInClosesAt: 2 });
    const logId = await ctx.db.insert("adminChanges", { actorId: userId, table: "days", recordId: dayId, at: 1, summary: "Added day" });
    const studentUserId = await ctx.db.insert("users", { role: "student" });
    const studentId = await ctx.db.insert("students", { userId: studentUserId, firstName: "Ada", lastName: "Lovelace", loginCode: "ada", group: "basic", curriculumId, sinceYear: "2026-27" });
    return { userId, studentUserId, studentId, curriculumId, dayId, keptDayId, assignmentId, revisionId, scheduleId, logId };
  });
  return { t, ...ids, admin: t.withIdentity({ subject: `${ids.userId}|session` }), student: t.withIdentity({ subject: `${ids.studentUserId}|session` }) };
}

test("deleting a day removes only its unused content and keeps audit logs", async () => {
  const { t, admin, dayId, keptDayId, assignmentId, revisionId, scheduleId, logId } = await setup();
  const oldLog = await t.run(ctx => ctx.db.get("adminChanges", logId));
  await admin.mutation(api.adminCurriculum.deleteDay, { dayId });
  await t.run(async ctx => {
    expect(await ctx.db.get("days", dayId)).toBeNull();
    expect(await ctx.db.get("days", keptDayId)).not.toBeNull();
    expect(await ctx.db.get("assignments", assignmentId)).toBeNull();
    expect(await ctx.db.get("assignmentRevisions", revisionId)).toBeNull();
    expect(await ctx.db.get("lessonSchedules", scheduleId)).toBeNull();
    expect(await ctx.db.get("adminChanges", logId)).toEqual(oldLog);
    const history = await ctx.db.query("adminChanges").withIndex("by_recordId_and_at", q => q.eq("recordId", dayId)).take(10);
    expect(history).toHaveLength(2);
  });
});

test("day deletion requires admin access and refuses archived curricula", async () => {
  const { t, student, admin, dayId } = await setup();
  await expect(t.mutation(api.adminCurriculum.deleteDay, { dayId })).rejects.toThrow(/Sign in/);
  await expect(student.mutation(api.adminCurriculum.deleteDay, { dayId })).rejects.toThrow(/Only admins/);
  await t.run(ctx => ctx.db.insert("classes", { group: "basic", name: "Python", year: "2026-27", status: "archived" }));
  await expect(admin.mutation(api.adminCurriculum.deleteDay, { dayId })).rejects.toThrow(/read-only|archived/i);
  expect(await t.run(ctx => ctx.db.get("days", dayId))).not.toBeNull();
});

test.each(["work", "attendance"])("day deletion preserves %s and refuses all cascading changes", async kind => {
  const { t, admin, studentId, userId, curriculumId, dayId, assignmentId, revisionId, scheduleId } = await setup();
  await t.run(async ctx => {
    if (kind === "work") await ctx.db.insert("workspaces", { studentId, assignmentId, curriculumId, group: "basic", year: "2026-27", latestVersion: 1, updatedAt: 1 });
    else await ctx.db.insert("attendance", { studentId, scheduleId, status: "present", markedBy: userId, markedAt: 1 });
  });
  await expect(admin.mutation(api.adminCurriculum.deleteDay, { dayId })).rejects.toThrow(/cannot be deleted/);
  await t.run(async ctx => {
    expect(await ctx.db.get("days", dayId)).not.toBeNull();
    expect(await ctx.db.get("assignments", assignmentId)).not.toBeNull();
    expect(await ctx.db.get("assignmentRevisions", revisionId)).not.toBeNull();
    expect(await ctx.db.get("lessonSchedules", scheduleId)).not.toBeNull();
    expect(await ctx.db.query("adminChanges").take(10)).toHaveLength(1);
  });
});
