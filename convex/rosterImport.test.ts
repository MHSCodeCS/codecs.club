import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { setupConvex } from "./test.setup";

async function setup() {
  const t = setupConvex();
  const { userId, curriculumId, nextId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { role: "admin" });
    await ctx.db.insert("admins", { userId, username: "teacher", displayName: "Teacher" });
    await ctx.db.insert("settings", { currentYear: "2026-27", timeZone: "America/Chicago", turnInDays: 14, closeTime: "23:59" });
    const curriculumId = await ctx.db.insert("curricula", { group: "basic", name: "Basics" });
    const nextId = await ctx.db.insert("curricula", { group: "advanced", name: "Advanced" });
    return { userId, curriculumId, nextId };
  });
  const admin = t.withIdentity({ subject: `${userId}|session` });
  const args = { group: "basic" as const, curriculumId, rows: [{ firstName: "Ada", lastName: "Lovelace", loginCode: "", mode: "new" as const }] };
  return { t, admin, args, nextId, userId };
}

test("preview and commit are admin-only, including student sessions", async () => {
  const { t, admin, args } = await setup();
  const preview = await admin.query(api.rosterImport.preview, args);
  const commit = { ...args, fingerprint: preview.fingerprint, key: "test" };
  await expect(t.query(api.rosterImport.preview, args)).rejects.toThrow(/Sign in/);
  await expect(t.mutation(api.rosterImport.commit, commit)).rejects.toThrow(/Sign in/);
  const [id] = await admin.mutation(api.rosterImport.commit, commit);
  const student = (await t.run(ctx => ctx.db.get("students", id)))!;
  const session = t.withIdentity({ subject: `${student.userId}|session` });
  await expect(session.query(api.rosterImport.preview, args)).rejects.toThrow(/Only admins/);
  await expect(session.mutation(api.rosterImport.commit, commit)).rejects.toThrow(/Only admins/);
});

test("preview writes nothing; same-name new people remain distinct with unique previewed codes", async () => {
  const { t, admin, args } = await setup();
  const input = { ...args, rows: [args.rows[0], args.rows[0]] };
  const preview = await admin.query(api.rosterImport.preview, input);
  expect(preview.valid).toBe(true);
  expect(preview.rows.map(r => r.loginCode)).toEqual(["alovelace", "alovelace1"]);
  expect(preview.rows.every(r => r.warning?.includes("Same name"))).toBe(true);
  expect(await t.run(ctx => ctx.db.query("students").take(5))).toEqual([]);
  const ids = await admin.mutation(api.rosterImport.commit, { ...input, fingerprint: preview.fingerprint, key: "new" });
  expect(new Set(ids).size).toBe(2);
  const history = await t.run(ctx => ctx.db.query("adminChanges").take(5));
  expect(history).toHaveLength(2);
  expect(history.every(h => h.actorId)).toBe(true);
});

test("returning students retain identity, original year, avatar and historical work when reassigned", async () => {
  const { t, admin, args, nextId } = await setup();
  const preview = await admin.query(api.rosterImport.preview, args);
  const [id] = await admin.mutation(api.rosterImport.commit, { ...args, fingerprint: preview.fingerprint, key: "first" });
  const student = (await t.run(ctx => ctx.db.get("students", id)))!;
  const workspaceId = await t.run(async ctx => {
    await ctx.db.patch("students", id, { sinceYear: "2025-26" });
    const dayId = await ctx.db.insert("days", { curriculumId: args.curriculumId, order: 1, topic: "Loops" });
    const assignmentId = await ctx.db.insert("assignments", { dayId, order: 1, type: "open", title: "Project", status: "published" });
    const workspaceId = await ctx.db.insert("workspaces", { studentId: id, assignmentId, year: "2025-26", group: "basic", curriculumId: args.curriculumId, latestVersion: 1, updatedAt: 123 });
    await ctx.db.insert("workFiles", { workspaceId, name: "main.py", content: "print('keep')", updatedAt: 123, updatedBy: student.userId });
    return workspaceId;
  });
  const update = { group: "advanced" as const, curriculumId: nextId, rows: [{ firstName: "Augusta", lastName: "King", loginCode: "A Lovelace", mode: "returning" as const }] };
  const second = await admin.query(api.rosterImport.preview, update);
  expect(second.rows[0].warning).toContain("Basics");
  expect(await admin.mutation(api.rosterImport.commit, { ...update, fingerprint: second.fingerprint, key: "second" })).toEqual([id]);
  expect(await t.run(ctx => ctx.db.get("students", id))).toMatchObject({ userId: student.userId, loginCode: student.loginCode, sinceYear: "2025-26", avatarColor: student.avatarColor, group: "advanced", curriculumId: nextId });
  expect(await t.run(ctx => ctx.db.get("users", student.userId))).toMatchObject({ name: "Augusta King" });
  expect(await t.run(ctx => ctx.db.get("workspaces", workspaceId))).toMatchObject({ group: "basic", year: "2025-26", curriculumId: args.curriculumId });
  expect(await t.run(ctx => ctx.db.query("workFiles").take(5))).toMatchObject([{ content: "print('keep')" }]);
  const history = await t.run(ctx => ctx.db.query("adminChanges").withIndex("by_recordId_and_at", q => q.eq("recordId", id)).take(10));
  expect(history).toHaveLength(2);
  expect(JSON.parse(history[1].before!)).toMatchObject({ firstName: "Ada", group: "basic" });
  expect(JSON.parse(history[1].after!)).toMatchObject({ firstName: "Augusta", group: "advanced" });
});

test("invalid rows never partially import; codes are required for returning identities", async () => {
  const { t, admin, args } = await setup();
  for (const bad of [
    { ...args.rows[0], mode: "returning" as const },
    { ...args.rows[0], firstName: " " },
    { ...args.rows[0], loginCode: "unknown", mode: "returning" as const },
    { ...args.rows[0], loginCode: "choose-code" },
  ]) {
    const input = { ...args, rows: [args.rows[0], bad] };
    const preview = await admin.query(api.rosterImport.preview, input);
    expect(preview.valid).toBe(false);
    expect(preview.rows[1].error).toBeTruthy();
    await expect(admin.mutation(api.rosterImport.commit, { ...input, fingerprint: preview.fingerprint, key: "bad" })).rejects.toThrow(/Correct/);
  }
  expect(await t.run(ctx => ctx.db.query("students").take(5))).toEqual([]);
});

test("stale previews refuse changes; successful retries do not duplicate identities or history", async () => {
  const { t, admin, args } = await setup();
  const preview = await admin.query(api.rosterImport.preview, args);
  const commit = { ...args, fingerprint: preview.fingerprint, key: "retry" };
  const ids = await admin.mutation(api.rosterImport.commit, commit);
  expect(await admin.mutation(api.rosterImport.commit, commit)).toEqual(ids);
  expect(await t.run(ctx => ctx.db.query("adminChanges").take(5))).toHaveLength(1);
  await expect(admin.mutation(api.rosterImport.commit, { ...commit, rows: [{ ...args.rows[0], firstName: "Another" }] })).rejects.toThrow(/retry key/);
  await expect(admin.mutation(api.rosterImport.commit, { ...commit, key: "another" })).rejects.toThrow(/roster changed/);
  expect(await t.run(ctx => ctx.db.query("students").take(5))).toHaveLength(1);
});

test("duplicate returning matches are refused; unchanged return creates no write history", async () => {
  const { t, admin, args } = await setup();
  const first = await admin.query(api.rosterImport.preview, args);
  await admin.mutation(api.rosterImport.commit, { ...args, fingerprint: first.fingerprint, key: "first" });
  const row = { ...args.rows[0], mode: "returning" as const, loginCode: first.rows[0].loginCode };
  const duplicate = await admin.query(api.rosterImport.preview, { ...args, rows: [row, row] });
  expect(duplicate.valid).toBe(false);
  expect(duplicate.rows[1].error).toContain("more than once");
  const input = { ...args, rows: [row] };
  const preview = await admin.query(api.rosterImport.preview, input);
  await admin.mutation(api.rosterImport.commit, { ...input, fingerprint: preview.fingerprint, key: "unchanged" });
  expect(await t.run(ctx => ctx.db.query("adminChanges").take(5))).toHaveLength(1);
});

test("target group and batch limits are enforced on the server", async () => {
  const { admin, args, nextId } = await setup();
  await expect(admin.query(api.rosterImport.preview, { ...args, curriculumId: nextId })).rejects.toThrow(/target group/);
  await expect(admin.query(api.rosterImport.preview, { ...args, rows: [] })).rejects.toThrow(/1–100/);
  await expect(admin.query(api.rosterImport.preview, { ...args, rows: Array.from({ length: 101 }, () => args.rows[0]) })).rejects.toThrow(/1–100/);
});

test.each(["current", "upcoming"] as const)("CSV transition into %s updates enrollment and preserves only future-placement seats", async status => {
  const { t, admin, args, nextId } = await setup();
  await t.run(async ctx => {
    await ctx.db.insert("classes", { group: "basic", name: "Basic", year: "2026-27", status: "current" });
    await ctx.db.insert("classes", { group: "advanced", name: "Advanced", year: "2026-27", status });
  });
  const first = await admin.query(api.rosterImport.preview, args);
  const [id] = await admin.mutation(api.rosterImport.commit, { ...args, fingerprint: first.fingerprint, key: "start" });
  await t.run(async ctx => {
    await ctx.db.patch("students", id, { seatIndex: 4 });
    await ctx.db.insert("enrollments", { studentId: id, group: "advanced", curriculumId: args.curriculumId, year: "2026-27" });
  });
  const input = { group: "advanced", curriculumId: nextId, rows: [{ ...args.rows[0], mode: "returning" as const, loginCode: first.rows[0].loginCode }] };
  const preview = await admin.query(api.rosterImport.preview, input);
  await admin.mutation(api.rosterImport.commit, { ...input, fingerprint: preview.fingerprint, key: "transfer" });
  const student = await t.run(ctx => ctx.db.get("students", id));
  expect(student?.group).toBe(status === "upcoming" ? "basic" : "advanced");
  expect(student?.seatIndex).toBe(status === "upcoming" ? 4 : undefined);
  const source = await admin.query(api.adminStudents.roster, { group: "basic", now: 0 });
  const target = await admin.query(api.adminStudents.roster, { group: "advanced", now: 0 });
  expect(source.students.some(s => s._id === id)).toBe(status === "upcoming");
  expect(target.students.some(s => s._id === id)).toBe(true);
  const enrollment = await t.run(ctx => ctx.db.query("enrollments").withIndex("by_studentId_and_group", q => q.eq("studentId", id).eq("group", "advanced")).unique());
  expect(enrollment?.curriculumId).toBe(nextId);
});
