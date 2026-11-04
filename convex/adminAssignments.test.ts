import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { setupConvex } from "./test.setup";

const content = { title: "Greeting", type: "guided" as const, summary: "Print a greeting", instructions: "Print Hello world", expectedOutput: "Hello world", starterFiles: [{ name: "main.py", content: "# Start here\n" }], parts: [{ name: "Greeting", kind: "equals" as const, expected: "Hello world" }], partialMin: 1, loopCheck: false, checkInput: "" };
async function setup() {
  const t = setupConvex();
  const { adminId, studentId, dayId } = await t.run(async ctx => {
    const adminId = await ctx.db.insert("users", { name: "Teacher", role: "admin" });
    await ctx.db.insert("admins", { userId: adminId, username: "teacher", displayName: "Teacher" });
    await ctx.db.insert("settings", { currentYear: "2026-27", turnInDays: 14, closeTime: "23:59", timeZone: "America/Chicago" });
    const curriculumId = await ctx.db.insert("curricula", { name: "Python", group: "basic" });
    const dayId = await ctx.db.insert("days", { curriculumId, topic: "Hello", order: 1 });
    const studentId = await ctx.db.insert("users", { name: "Ada", role: "student" });
    await ctx.db.insert("students", { userId: studentId, firstName: "Ada", lastName: "Lovelace", loginCode: "alovelace", group: "basic", curriculumId, sinceYear: "2026-27" });
    return { adminId, studentId, dayId };
  });
  return { t, dayId, admin: t.withIdentity({ subject: `${adminId}|session` }), student: t.withIdentity({ subject: `${studentId}|session` }) };
}

test("drafts are admin-only; publication makes the intended lesson visible", async () => {
  const { t, admin, student, dayId } = await setup();
  const args = { dayId, baseRevisionId: null, publish: false, content };
  await expect(t.mutation(api.adminAssignments.save, args)).rejects.toThrow(/Sign in/);
  await expect(student.mutation(api.adminAssignments.save, args)).rejects.toThrow(/Only admins/);
  const draft = await admin.mutation(api.adminAssignments.save, args);
  expect((await student.query(api.student.day, { dayId }))?.assignments).toEqual([]);
  expect(await student.query(api.workspaces.get, { assignmentId: draft.assignmentId })).toBeNull();
  await expect(student.query(api.adminAssignments.get, { assignmentId: draft.assignmentId })).rejects.toThrow(/Only admins/);
  await expect(student.query(api.adminAssignments.catalog, { group: "basic" })).rejects.toThrow(/Only admins/);
  await expect(student.query(api.adminAssignments.revision, { revisionId: draft.revisionId })).rejects.toThrow(/Only admins/);
  await admin.mutation(api.adminAssignments.save, { ...args, assignmentId: draft.assignmentId, baseRevisionId: draft.revisionId, publish: true });
  expect((await student.query(api.student.day, { dayId }))?.assignments[0].title).toBe("Greeting");
});

test("draft edits do not leak; publishing preserves work, submissions and prior check results", async () => {
  const { t, admin, student, dayId } = await setup();
  const first = await admin.mutation(api.adminAssignments.save, { dayId, baseRevisionId: null, publish: true, content });
  const workspaceId = await student.mutation(api.workspaces.open, { assignmentId: first.assignmentId });
  const prepared = await student.mutation(api.checks.prepare, { workspaceId });
  const check = await student.mutation(api.checks.record, { workspaceId, versionId: prepared.versionId, revisionId: prepared.revisionId, output: "Hello world", outputTruncated: false, runOutcome: "ok" });
  await student.mutation(api.submissions.turnIn, { workspaceId, idempotencyKey: "phase7-submit" });
  const original = await t.run(async ctx => ({ files: await ctx.db.query("workFiles").withIndex("by_workspaceId_and_name", q => q.eq("workspaceId", workspaceId)).take(20), submission: await ctx.db.query("submissions").withIndex("by_workspaceId_and_attempt", q => q.eq("workspaceId", workspaceId)).first() }));
  const draft = await admin.mutation(api.adminAssignments.save, { assignmentId: first.assignmentId, dayId, baseRevisionId: first.revisionId, publish: false, content: { ...content, title: "Private title", instructions: "Private instructions", type: "open" } });
  const beforePublish = await student.query(api.workspaces.get, { assignmentId: first.assignmentId });
  expect(beforePublish?.assignment).toMatchObject({ title: "Greeting", type: "guided", instructions: content.instructions });
  const published = await admin.mutation(api.adminAssignments.save, { assignmentId: first.assignmentId, dayId, baseRevisionId: draft.revisionId, publish: true, content: { ...content, title: "New title", instructions: "New instructions", starterFiles: [{ name: "main.py", content: "new starter" }], parts: [{ name: "New check", kind: "equals", expected: "Bye" }] } });
  expect((await student.query(api.workspaces.get, { assignmentId: first.assignmentId }))?.assignment.title).toBe("New title");
  expect(await t.run(ctx => ctx.db.query("workFiles").withIndex("by_workspaceId_and_name", q => q.eq("workspaceId", workspaceId)).take(20))).toEqual(original.files);
  expect(await t.run(ctx => ctx.db.get("submissions", original.submission!._id))).toEqual(original.submission);
  expect(await t.run(ctx => ctx.db.get("checkResults", check.checkId))).toMatchObject({ revisionId: first.revisionId, outcome: "complete" });
  expect(await student.query(api.checks.latest, { workspaceId })).toMatchObject({ currentTask: false });
  const history = await admin.query(api.adminAssignments.revisions, { assignmentId: first.assignmentId, paginationOpts: { numItems: 10, cursor: null } });
  expect(history.page).toHaveLength(3);
  expect(history.page.find(r => r._id === published.revisionId)?.published).toBe(true);
  expect((await admin.query(api.adminAssignments.revision, { revisionId: first.revisionId }))?.instructions).toBe(content.instructions);
  await expect(admin.mutation(api.adminAssignments.save, { assignmentId: first.assignmentId, dayId, baseRevisionId: first.revisionId, publish: false, content })).rejects.toThrow(/another tab/);
});

test("publication validation rejects incomplete rules and invalid files; open work starts blank", async () => {
  const { admin, student, dayId } = await setup();
  const args = { dayId, baseRevisionId: null, publish: true, content };
  await expect(admin.mutation(api.adminAssignments.save, { ...args, content: { ...content, instructions: "" } })).rejects.toThrow(/instructions/);
  await expect(admin.mutation(api.adminAssignments.save, { ...args, content: { ...content, parts: [] } })).rejects.toThrow(/parts|part/);
  await expect(admin.mutation(api.adminAssignments.save, { ...args, content: { ...content, parts: [{ ...content.parts[0], expected: "  " }] } })).rejects.toThrow(/expected output/);
  await expect(admin.mutation(api.adminAssignments.save, { ...args, content: { ...content, partialMin: 1.5 } })).rejects.toThrow(/whole number/);
  await expect(admin.mutation(api.adminAssignments.save, { ...args, content: { ...content, starterFiles: [{ name: "../main.py", content: "" }] } })).rejects.toThrow(/file names/i);
  await expect(admin.mutation(api.adminAssignments.save, { ...args, content: { ...content, starterFiles: [{ name: "main.py", content: "a".repeat(100001) }] } })).rejects.toThrow(/100 KB/);
  const open = await admin.mutation(api.adminAssignments.save, { ...args, content: { ...content, type: "open", parts: [], partialMin: 0 } });
  const workspaceId = await student.mutation(api.workspaces.open, { assignmentId: open.assignmentId });
  expect((await student.query(api.workspaces.get, { assignmentId: open.assignmentId }))?.workspace?.files[0].content).toBe("");
  await expect(student.mutation(api.checks.prepare, { workspaceId })).rejects.toThrow(/no automatic check/);
});

test("cover uploads require admin, validate metadata and persist through lesson queries", async () => {
  const { t, admin, student, dayId } = await setup();
  await expect(student.mutation(api.adminCurriculum.coverUploadUrl, {})).rejects.toThrow(/Only admins/);
  await expect(t.mutation(api.adminCurriculum.coverUploadUrl, {})).rejects.toThrow(/Sign in/);
  const imageId = await t.run(ctx => ctx.storage.store(new Blob(["image"], { type: "image/png" })));
  // convex-test's storeBlob omits Content-Type; emulate HTTP-upload metadata.
  await t.run(ctx => ctx.db.patch(imageId as never, { contentType: "image/png" } as never));
  const textId = await t.run(ctx => ctx.storage.store(new Blob(["hello"], { type: "text/plain" })));
  await expect(admin.mutation(api.adminCurriculum.setCover, { dayId, storageId: textId })).rejects.toThrow(/PNG/);
  await expect(student.mutation(api.adminCurriculum.setCover, { dayId, storageId: imageId })).rejects.toThrow(/Only admins/);
  await admin.mutation(api.adminCurriculum.setCover, { dayId, storageId: imageId });
  expect((await student.query(api.student.day, { dayId }))?.day.coverUrl).toBeTruthy();
  await admin.mutation(api.adminCurriculum.setCover, { dayId, storageId: null });
  expect((await student.query(api.student.day, { dayId }))?.day.coverUrl).toBeNull();
});
