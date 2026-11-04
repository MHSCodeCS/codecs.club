import { expect, test, vi, afterEach } from "vitest";
import * as Y from "yjs";
import { api, internal } from "./_generated/api";
import { setupConvex } from "./test.setup";
import { sharedDocument, sharedBytes } from "./lib/sharedText";

afterEach(() => vi.useRealTimers());
async function setup() {
  const t = setupConvex();
  const ids = await t.run(async ctx => {
    const adminId = await ctx.db.insert("users", { role: "admin", name: "Max" });
    await ctx.db.insert("admins", { userId: adminId, username: "one", displayName: "Max Rivera" });
    const secondId = await ctx.db.insert("users", { role: "admin", name: "Sam Green" });
    await ctx.db.insert("admins", { userId: secondId, username: "two", displayName: "Sam Green" });
    const userId = await ctx.db.insert("users", { role: "student", name: "Ada" });
    const otherUserId = await ctx.db.insert("users", { role: "student", name: "Grace" });
    await ctx.db.insert("settings", { currentYear: "2026-27", turnInDays: 14, closeTime: "23:59", timeZone: "America/Chicago" });
    const curriculumId = await ctx.db.insert("curricula", { group: "basic", name: "Python" });
    const studentId = await ctx.db.insert("students", { userId, firstName: "Ada", lastName: "Lovelace", loginCode: "ada", group: "basic", curriculumId, sinceYear: "2026-27" });
    const otherId = await ctx.db.insert("students", { userId: otherUserId, firstName: "Grace", lastName: "Hopper", loginCode: "grace", group: "basic", curriculumId, sinceYear: "2026-27" });
    const dayId = await ctx.db.insert("days", { curriculumId, order: 1, topic: "Loops" });
    const assignmentId = await ctx.db.insert("assignments", { dayId, order: 1, type: "open", title: "Project", status: "published" });
    const workspaceId = await ctx.db.insert("workspaces", { studentId, assignmentId, year: "2026-27", group: "basic", curriculumId, latestVersion: 1, updatedAt: Date.now() });
    await ctx.db.insert("workFiles", { workspaceId, name: "main.py", content: "print('hello')\n", revision: 1, updatedAt: Date.now(), updatedBy: userId });
    await ctx.db.insert("workVersions", { workspaceId, number: 1, files: [{ name: "main.py", content: "print('hello')\n" }], reason: "start", createdAt: Date.now(), createdBy: userId });
    return { adminId, secondId, userId, otherUserId, studentId, otherId, workspaceId, assignmentId };
  });
  const as = (userId: string) => t.withIdentity({ subject: `${userId}|test-session` });
  return { t, ...ids, admin: as(ids.adminId), second: as(ids.secondId), student: as(ids.userId), other: as(ids.otherUserId) };
}

test("assistance is authenticated, scoped to owners, and teacher edits require joining", async () => {
  const { t, admin, other, student, workspaceId } = await setup();
  await expect(t.query(api.assistance.detail, { workspaceId })).rejects.toThrow(/Sign in/);
  await expect(other.query(api.assistance.detail, { workspaceId })).rejects.toThrow(/not found/);
  await expect(student.query(api.assistance.classroom, { group: "basic" })).rejects.toThrow(/Only admins/);
  const save = { workspaceId, files: [{ name: "main.py", content: "changed", baseRevision: 1 }] };
  await expect(admin.mutation(api.workspaces.saveFiles, save)).rejects.toThrow(/Join/);
  await admin.mutation(api.assistance.join, { workspaceId });
  await admin.mutation(api.workspaces.saveFiles, save);
  await admin.mutation(api.assistance.leave, { workspaceId });
  await expect(admin.mutation(api.workspaces.saveFiles, save)).rejects.toThrow(/Join/);
});

test("help requests deduplicate and appear in the queue/badge with assignment context", async () => {
  const { student, other, admin, workspaceId } = await setup();
  await expect(other.mutation(api.assistance.requestHelp, { workspaceId })).rejects.toThrow(/not found/);
  const id = await student.mutation(api.assistance.requestHelp, { workspaceId });
  expect(await student.mutation(api.assistance.requestHelp, { workspaceId })).toBe(id);
  const classroom = await admin.query(api.assistance.classroom, { group: "basic" });
  expect(classroom.help).toMatchObject([{ id, workspaceId, task: "Project", name: "Ada Lovelace" }]);
  expect((await admin.query(api.adminNav.badges, {})).openHelp).toBe(1);
  await expect(student.mutation(api.assistance.resolveHelp, { id })).rejects.toThrow(/Only admins/);
  await admin.mutation(api.assistance.resolveHelp, { id });
  await admin.mutation(api.assistance.resolveHelp, { id });
  expect((await student.query(api.assistance.detail, { workspaceId })).helpId).toBeNull();
  expect((await admin.query(api.adminNav.badges, {})).openHelp).toBe(0);
  expect(await student.mutation(api.assistance.requestHelp, { workspaceId })).not.toBe(id);
});

test("join, leave, expiry and guidance are visible to the student and persist with attribution", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const { t, admin, student, workspaceId } = await setup();
  const id = await admin.mutation(api.assistance.join, { workspaceId });
  expect(await admin.mutation(api.assistance.join, { workspaceId })).toBe(id);
  await admin.mutation(api.assistance.addNote, { workspaceId, body: "  Look at the loop condition.  " });
  let data = await student.query(api.assistance.detail, { workspaceId });
  expect(data.events).toMatchObject([{ name: "Max", kind: "joined" }]);
  expect(data.notes).toMatchObject([{ body: "Look at the loop condition.", name: "Max" }]);
  await expect(student.mutation(api.assistance.addNote, { workspaceId, body: "no" })).rejects.toThrow(/Only admins/);
  vi.setSystemTime(Date.now() + 61_000);
  await t.mutation(internal.assistance.expireSession, { id });
  data = await student.query(api.assistance.detail, { workspaceId });
  expect(data.events.some(event => event.kind === "left")).toBe(true);
  expect(data.sessions).toHaveLength(0);
  expect(data.notes).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("adminChanges").take(10))).toHaveLength(3);
});

test("seats are group-scoped, bounded and collision-safe, with history", async () => {
  const { admin, student, t, studentId, otherId } = await setup();
  await expect(student.mutation(api.assistance.setSeat, { studentId, seatIndex: 0 })).rejects.toThrow(/Only admins/);
  await admin.mutation(api.assistance.setSeat, { studentId, seatIndex: 0 });
  await expect(admin.mutation(api.assistance.setSeat, { studentId: otherId, seatIndex: 0 })).rejects.toThrow(/occupied/);
  await expect(admin.mutation(api.assistance.setSeat, { studentId, seatIndex: 60 })).rejects.toThrow(/1 to 60/);
  await admin.mutation(api.assistance.setSeat, { studentId, seatIndex: null });
  await admin.mutation(api.assistance.setSeat, { studentId: otherId, seatIndex: 0 });
  expect((await t.run(ctx => ctx.db.get("students", otherId)))?.seatIndex).toBe(0);
});

test("presence aggregates tabs, protects identity and shows labeled workspace cursors", async () => {
  const { admin, student, other, t, workspaceId, userId } = await setup();
  const first = await student.mutation(api.presence.heartbeat, { sessionId: "tab1", workspaceId, active: true, file: "main.py", anchor: "{}", head: "{}" });
  await student.mutation(api.presence.heartbeat, { sessionId: "tab2", workspaceId, active: false });
  await Promise.all(first.tokens.map(sessionToken => student.mutation(api.presence.disconnect, { sessionToken })));
  let classroom = await admin.query(api.assistance.classroom, { group: "basic" });
  expect(classroom.online.filter(p => p.online && p.userId === userId)).toHaveLength(1);
  await expect(other.mutation(api.presence.heartbeat, { sessionId: "tab1", workspaceId, active: true })).rejects.toThrow(/not found/);
  await expect(t.mutation(api.presence.heartbeat, { sessionId: "spoof", active: true })).rejects.toThrow(/Sign in/);
  await expect(admin.mutation(api.presence.heartbeat, { sessionId: "teacher", workspaceId, active: true })).rejects.toThrow(/Join/);
  await admin.mutation(api.assistance.join, { workspaceId });
  await admin.mutation(api.presence.heartbeat, { sessionId: "teacher", workspaceId, active: true, file: "main.py", anchor: "{}", head: "{}" });
  expect((await student.query(api.assistance.detail, { workspaceId })).cursors).toMatchObject(expect.arrayContaining([expect.objectContaining({ name: "Max", role: "teacher", file: "main.py" })]));
  classroom = await admin.query(api.assistance.classroom, { group: "advanced" });
  expect(classroom.students).toEqual([]);
});

test("concurrent shared edits merge instead of overwriting, and teacher versions are attributed", async () => {
  const { t, student, admin, workspaceId } = await setup();
  const initial = await student.query(api.assistance.detail, { workspaceId });
  const left = sharedDocument(initial.files[0].content, initial.files[0].sharedState);
  const right = sharedDocument(initial.files[0].content, initial.files[0].sharedState);
  left.getText("code").insert(0, "# student\n");
  right.getText("code").insert(right.getText("code").length, "# teacher\n");
  await admin.mutation(api.assistance.join, { workspaceId });
  await student.mutation(api.workspaces.saveFiles, { workspaceId, files: [{ name: "main.py", baseRevision: 1, content: left.getText("code").toString(), sharedUpdate: sharedBytes(left) }] });
  const saved = await admin.mutation(api.workspaces.saveFiles, { workspaceId, files: [{ name: "main.py", baseRevision: 1, content: right.getText("code").toString(), sharedUpdate: sharedBytes(right) }] });
  const file = (await student.query(api.assistance.detail, { workspaceId })).files[0];
  expect(file.content).toBe("# student\nprint('hello')\n# teacher\n");
  Y.applyUpdate(left, new Uint8Array(saved.files[0].sharedState!));
  Y.applyUpdate(right, new Uint8Array(saved.files[0].sharedState!));
  expect(left.getText("code").toString()).toBe(right.getText("code").toString());
  expect(await t.run(ctx => ctx.db.query("workVersions").withIndex("by_workspaceId_and_number", q => q.eq("workspaceId", workspaceId)).order("desc").first())).toMatchObject({ reason: "teacher" });
});

test("a disconnected edit after a restore converges and old versions remain immutable", async () => {
  const { student, workspaceId } = await setup();
  await student.mutation(api.workspaces.saveFiles, { workspaceId, files: [{ name: "main.py", baseRevision: 1, content: "print('new')\n" }] });
  const file = (await student.query(api.assistance.detail, { workspaceId })).files[0];
  const offline = sharedDocument(file.content, file.sharedState);
  offline.getText("code").insert(offline.getText("code").length, "# offline work\n");
  await student.mutation(api.workspaces.restore, { workspaceId, number: 1 });
  await student.mutation(api.workspaces.saveFiles, { workspaceId, files: [{ name: "main.py", baseRevision: file.revision, content: offline.getText("code").toString(), sharedUpdate: sharedBytes(offline) }] });
  const next = (await student.query(api.assistance.detail, { workspaceId })).files[0];
  expect(next.content).toContain("# offline work");
  expect((await student.query(api.workspaces.version, { workspaceId, number: 1 }))?.files[0].content).toBe("print('hello')\n");
});

test("remote runs pin saved files, identify the actor, refuse busy runs and isolate late output", async () => {
  const { admin, second, student, other, t, workspaceId } = await setup();
  await admin.mutation(api.assistance.join, { workspaceId });
  await second.mutation(api.assistance.join, { workspaceId });
  await expect(student.mutation(api.remoteRuns.start, { workspaceId, entry: "main.py", key: "no" })).rejects.toThrow(/Only admins/);
  const input = { workspaceId, entry: "main.py", key: "run-one" };
  const first = await admin.mutation(api.remoteRuns.start, input);
  expect(first.run.actorName).toBe("Max");
  expect((await admin.mutation(api.remoteRuns.start, input)).run._id).toBe(first.run._id);
  await expect(second.mutation(api.remoteRuns.start, { ...input, key: "run-two" })).rejects.toThrow(/already active/);
  await student.mutation(api.workspaces.saveFiles, { workspaceId, files: [{ name: "main.py", content: "print('later')", baseRevision: 1 }] });
  expect((await student.query(api.assistance.detail, { workspaceId })).remote).toMatchObject({ stale: true, version: 1 });
  expect((await t.run(ctx => ctx.db.get("workVersions", first.run.versionId)))?.files).toEqual(first.files);
  await expect(other.mutation(api.remoteRuns.stop, { id: first.run._id })).rejects.toThrow(/not found/);
  await expect(second.mutation(api.remoteRuns.publish, { id: first.run._id, output: "spoof", outputTruncated: false, status: "finished" })).rejects.toThrow(/not found/);
  await student.mutation(api.remoteRuns.stop, { id: first.run._id });
  expect((await student.query(api.assistance.detail, { workspaceId })).remote?.run.stopRequested).toBe(true);
  await admin.mutation(api.remoteRuns.publish, { id: first.run._id, output: "hello", outputTruncated: false, status: "stopped" });
  const next = await second.mutation(api.remoteRuns.start, { ...input, key: "run-two" });
  await admin.mutation(api.remoteRuns.publish, { id: first.run._id, output: "late", outputTruncated: false, status: "running" });
  expect((await student.query(api.assistance.detail, { workspaceId })).remote?.run._id).toBe(next.run._id);
  expect((await t.run(ctx => ctx.db.get("remoteRuns", first.run._id)))?.output).toBe("hello");
});

test("abandoned runs expire and a late publisher cannot report success", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const { admin, student, t, workspaceId } = await setup();
  await admin.mutation(api.assistance.join, { workspaceId });
  const { run } = await admin.mutation(api.remoteRuns.start, { workspaceId, entry: "main.py", key: "timeout" });
  vi.setSystemTime(Date.now() + 31_000);
  await t.mutation(internal.remoteRuns.expire, { id: run._id });
  await admin.mutation(api.remoteRuns.publish, { id: run._id, output: "late", outputTruncated: false, status: "finished" });
  expect((await student.query(api.assistance.detail, { workspaceId })).remote?.run).toMatchObject({ status: "interrupted", output: "" });
});

test("focus presence switches away immediately, aggregates tabs, and restores on return", async () => {
  const { admin, student, other, userId } = await setup();
  await student.mutation(api.presence.heartbeat, { sessionId: "tab1", active: true, focused: true });
  expect((await admin.query(api.assistance.classroom, { group: "basic" })).focused.map(p => p.userId)).toContain(userId);
  await student.mutation(api.presence.heartbeat, { sessionId: "tab1", active: false, focused: false });
  let room = await admin.query(api.assistance.classroom, { group: "basic" });
  expect(room.online.some(p => p.userId === userId && p.online)).toBe(true);
  expect(room.focused.some(p => p.userId === userId)).toBe(false);
  await other.mutation(api.presence.heartbeat, { sessionId: "tab1", active: true, focused: true });
  expect((await admin.query(api.assistance.classroom, { group: "basic" })).focused.some(p => p.userId === userId)).toBe(false);
  const visible = await student.mutation(api.presence.heartbeat, { sessionId: "tab2", active: false, focused: true });
  await student.mutation(api.presence.heartbeat, { sessionId: "tab1", active: false, focused: false });
  room = await admin.query(api.assistance.classroom, { group: "basic" });
  expect(room.focused.filter(p => p.userId === userId)).toHaveLength(1);
  await Promise.all(visible.tokens.map(sessionToken => student.mutation(api.presence.disconnect, { sessionToken })));
  expect((await admin.query(api.assistance.classroom, { group: "basic" })).focused.some(p => p.userId === userId)).toBe(false);
  await student.mutation(api.presence.heartbeat, { sessionId: "tab1", active: true, focused: true });
  expect((await admin.query(api.assistance.classroom, { group: "basic" })).focused.some(p => p.userId === userId)).toBe(true);
});
