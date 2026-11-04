import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvex } from "./test.setup";

async function setup() {
  const t = setupConvex();
  const adminId = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { name: "Teacher", role: "admin" });
    await ctx.db.insert("admins", { userId, username: "teacher", displayName: "Teacher" });
    return userId;
  });
  await t.mutation(internal.seed.run, {});
  const student = async (code: string) => (await t.run(ctx => ctx.db.query("students").withIndex("by_loginCode", q => q.eq("loginCode", code)).unique()))!;
  const jordan = await student("jsmith");
  const priya = await student("ppatel");
  return { t, jordan, priya, admin: t.withIdentity({ subject: `${adminId}|session` }), asJordan: t.withIdentity({ subject: `${jordan.userId}|session` }), asPriya: t.withIdentity({ subject: `${priya.userId}|session` }) };
}
const paginationOpts = { numItems: 20, cursor: null };

test("My Work returns only owned saved work, paginates and keeps original historical context", async () => {
  const { t, asJordan, admin, jordan } = await setup();
  await expect(t.query(api.myWork.list, { paginationOpts })).rejects.toThrow(/Sign in/);
  await expect(admin.query(api.myWork.list, { paginationOpts })).rejects.toThrow(/Only students/);
  const list = await asJordan.query(api.myWork.list, { paginationOpts });
  expect(list.page.length).toBeGreaterThan(1);
  const old = list.page.find(w => w.year === "2025-26")!;
  expect(old).toMatchObject({ current: false, curriculumName: "Intro to Python", group: "basic", title: "Guessing game" });
  const first = await asJordan.query(api.myWork.list, { paginationOpts: { numItems: 1, cursor: null } });
  const next = await asJordan.query(api.myWork.list, { paginationOpts: { numItems: 1, cursor: first.continueCursor } });
  expect(first.page[0]._id).not.toBe(next.page[0]._id);
  const workspace = await asJordan.query(api.workspaces.get, { assignmentId: old.assignmentId });
  expect(workspace?.day).toMatchObject({ inCurrentCurriculum: false, year: "2025-26", curriculumName: "Intro to Python" });
  const advanced = (await t.run(ctx => ctx.db.query("curricula").withIndex("by_group", q => q.eq("group", "advanced")).first()))!;
  await admin.mutation(api.adminStudents.updateStudent, { studentId: jordan._id, loginCode: jordan.loginCode, group: "advanced", curriculumId: advanced._id });
  const moved = await asJordan.query(api.myWork.list, { paginationOpts });
  expect(moved.page).toHaveLength(list.page.length);
  expect(moved.page.every(w => !w.current && w.group === "basic")).toBe(true);
  expect(await asJordan.query(api.workspaces.get, { assignmentId: old.assignmentId })).not.toBeNull();
});

test("submission snapshots and feedback are owned, private notes excluded, working edits preserve snapshots", async () => {
  const { t, asJordan, asPriya, jordan } = await setup();
  const list = await asJordan.query(api.myWork.list, { paginationOpts });
  const nameTag = list.page.find(w => w.title === "Name tag")!;
  const attempts = await asJordan.query(api.myWork.attempts, { workspaceId: nameTag._id, paginationOpts });
  expect(attempts.page[0].feedback[0].body).toMatch(/favorite color/);
  const submissionId = attempts.page[0]._id;
  await t.run(async ctx => {
    const submission = (await ctx.db.get("submissions", submissionId))!;
    await ctx.db.insert("feedback", { submissionId, studentId: jordan._id, authorId: submission.reviewedBy!, body: "Private teacher note", visibility: "private", createdAt: Date.now() });
  });
  const visible = await asJordan.query(api.myWork.attempts, { workspaceId: nameTag._id, paginationOpts });
  expect(JSON.stringify(visible)).not.toContain("Private teacher note");
  const before = await asJordan.query(api.myWork.submittedFiles, { submissionId });
  await t.run(async ctx => {
    const file = (await ctx.db.query("workFiles").withIndex("by_workspaceId_and_name", q => q.eq("workspaceId", nameTag._id)).first())!;
    await ctx.db.patch("workFiles", file._id, { content: "changed after submission" });
  });
  expect(await asJordan.query(api.myWork.submittedFiles, { submissionId })).toEqual(before);
  expect((await asPriya.query(api.myWork.attempts, { workspaceId: nameTag._id, paginationOpts })).page).toEqual([]);
  expect(await asPriya.query(api.myWork.submittedFiles, { submissionId })).toBeNull();
  const priyaList = await asPriya.query(api.myWork.list, { paginationOpts });
  const countdown = priyaList.page.find(w => w.title === "Countdown")!;
  const history = await asPriya.query(api.myWork.attempts, { workspaceId: countdown._id, paginationOpts });
  expect(history.page.map(a => a.attempt)).toEqual([2, 1]);
});
