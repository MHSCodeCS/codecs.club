import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { setupConvex } from "./test.setup";

test("archived records expose saved files, submitted snapshots, feedback and attendance only to admins", async () => {
  const t = setupConvex();
  const data = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { role: "admin" });
    await ctx.db.insert("admins", { userId, username: "teacher", displayName: "Teacher" });
    await ctx.db.insert("settings", { currentYear: "2026-27", timeZone: "America/Chicago", turnInDays: 14, closeTime: "23:59" });
    await ctx.db.insert("classes", { group: "past", name: "Past", year: "2025-26", status: "archived" });
    const curriculumId = await ctx.db.insert("curricula", { group: "past", name: "Past" });
    const studentUser = await ctx.db.insert("users", { role: "student" });
    const studentId = await ctx.db.insert("students", { userId: studentUser, firstName: "Ada", lastName: "Lovelace", loginCode: "ada", group: "other", curriculumId, sinceYear: "2025-26", avatarColor: "#5ee8bf" });
    const dayId = await ctx.db.insert("days", { curriculumId, order: 1, topic: "Project" });
    const scheduleId = await ctx.db.insert("lessonSchedules", { dayId, year: "2025-26", lessonAt: 1, turnInClosesAt: 2 });
    await ctx.db.insert("attendance", { studentId, scheduleId, status: "present", markedBy: userId, markedAt: 1 });
    const assignmentId = await ctx.db.insert("assignments", { dayId, order: 1, type: "open", title: "Project", status: "published" });
    const workspaceId = await ctx.db.insert("workspaces", { studentId, assignmentId, group: "past", year: "2025-26", curriculumId, latestVersion: 1, updatedAt: 1 });
    await ctx.db.insert("workFiles", { workspaceId, name: "main.py", content: "working", updatedAt: 1, updatedBy: studentUser });
    const versionId = await ctx.db.insert("workVersions", { workspaceId, number: 1, files: [{ name: "main.py", content: "submitted" }], createdBy: studentUser, createdAt: 1, reason: "submit" });
    const submissionId = await ctx.db.insert("submissions", { workspaceId, studentId, assignmentId, attempt: 1, versionId, submittedAt: 1, status: "reviewed", idempotencyKey: "one" });
    await ctx.db.insert("feedback", { submissionId, studentId, authorId: userId, body: "Historical feedback", visibility: "student", createdAt: 1 });
    return { userId, studentUser, studentId, assignmentId, workspaceId, submissionId };
  });
  const admin = t.withIdentity({ subject: `${data.userId}|session` });
  const paginationOpts = { numItems: 10, cursor: null };
  expect((await admin.query(api.archiveRecords.workspaces, { assignmentId: data.assignmentId, paginationOpts })).page[0].name).toBe("Ada Lovelace");
  expect((await admin.query(api.archiveRecords.files, { workspaceId: data.workspaceId }))[0].content).toBe("working");
  expect((await admin.query(api.archiveRecords.submissions, { workspaceId: data.workspaceId, paginationOpts })).page[0].version?.files[0].content).toBe("submitted");
  expect((await admin.query(api.archiveRecords.feedback, { submissionId: data.submissionId, paginationOpts })).page[0].body).toBe("Historical feedback");
  expect((await admin.query(api.adminStudents.attendanceDays, { studentId: data.studentId, group: "past" })).days[0].status).toBe("present");
  for (const client of [t, t.withIdentity({ subject: `${data.studentUser}|session` })]) {
    await expect(client.query(api.archiveRecords.workspaces, { assignmentId: data.assignmentId, paginationOpts })).rejects.toThrow();
    await expect(client.query(api.archiveRecords.files, { workspaceId: data.workspaceId })).rejects.toThrow();
    await expect(client.query(api.archiveRecords.submissions, { workspaceId: data.workspaceId, paginationOpts })).rejects.toThrow();
    await expect(client.query(api.archiveRecords.feedback, { submissionId: data.submissionId, paginationOpts })).rejects.toThrow();
  }
});
