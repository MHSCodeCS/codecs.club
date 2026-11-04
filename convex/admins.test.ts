import { beforeAll, expect, test } from "vitest";
import { avatarColors } from "./lib/studentAvatars";
import { api } from "./_generated/api";
import { setAuthEnv, setupConvex } from "./test.setup";

beforeAll(setAuthEnv);
const credentials = { firstName: "Maria", lastName: "Rivera", password: "correct-horse-battery" };
const paginationOpts = { numItems: 25, cursor: null };

async function setup() {
  const t = setupConvex();
  const { userId, adminId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { role: "admin", name: "Owner" });
    const adminId = await ctx.db.insert("admins", { userId, username: "owner", displayName: "Owner" });
    return { userId, adminId };
  });
  return { t, userId, adminId, admin: t.withIdentity({ subject: `${userId}|session` }) };
}

async function signIn(t: ReturnType<typeof setupConvex>, username = "mrivera", password = credentials.password) {
  return await t.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", email: username, password } });
}

test("staff endpoints refuse anonymous and student access", async () => {
  const { t, adminId } = await setup();
  const studentId = await t.run(ctx => ctx.db.insert("users", { role: "student" }));
  const student = t.withIdentity({ subject: `${studentId}|session` });
  for (const client of [t, student]) {
    await expect(client.query(api.admins.list, { paginationOpts })).rejects.toThrow();
    await expect(client.mutation(api.admins.createStaff, credentials)).rejects.toThrow();
    await expect(client.mutation(api.admins.updateStaff, { adminId, ...credentials })).rejects.toThrow();
    await expect(client.mutation(api.admins.deleteStaff, { adminId })).rejects.toThrow();
  }
  expect(await t.run(ctx => ctx.db.query("admins").take(10))).toHaveLength(1);
});

test("creating teachers generates login codes and avatars, validates input and logs no secrets", async () => {
  const { t, admin } = await setup();
  const id = await admin.mutation(api.admins.createStaff, { ...credentials, firstName: " María ", lastName: " Rivera " });
  const teacher = (await admin.query(api.admins.list, { paginationOpts })).page.find(row => row._id === id)!;
  expect(teacher).toMatchObject({ username: "mrivera", displayName: "María Rivera", firstName: "María", lastName: "Rivera", isSelf: false });
  expect(avatarColors).toContain(teacher.avatarColor);
  const stored = (await t.run(ctx => ctx.db.get("admins", id)))!;
  expect(stored.avatarColor).toBe(teacher.avatarColor);
  const viewer = await t.withIdentity({ subject: `${stored.userId}|session` }).query(api.viewer.current, {});
  expect(viewer).toMatchObject({ role: "admin", avatarColor: teacher.avatarColor });
  expect((await signIn(t)).tokens?.token).toBeTruthy();
  const account = await t.run(ctx => ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", "password").eq("providerAccountId", "mrivera")).unique());
  expect(account?.secret).toBeTruthy();
  expect(account?.secret).not.toBe(credentials.password);
  for (const args of [{ ...credentials, firstName: " " }, { ...credentials, lastName: " " }, { ...credentials, password: "short" }]) {
    await expect(admin.mutation(api.admins.createStaff, args)).rejects.toThrow();
  }
  const history = await t.run(ctx => ctx.db.query("adminChanges").take(10));
  expect(history).toHaveLength(1);
  expect(JSON.stringify(history)).not.toContain(credentials.password);
  expect(history[0].actorName).toBe("Owner");
});

test("editing names keeps the login code and avatar stable, and password resets still work", async () => {
  const { t, admin, adminId } = await setup();
  const id = await admin.mutation(api.admins.createStaff, credentials);
  const before = await t.run(ctx => ctx.db.get("admins", id));
  await admin.mutation(api.admins.updateStaff, { adminId: id, firstName: "Marie", lastName: "Rivera-Smith" });
  expect((await signIn(t)).tokens?.token).toBeTruthy();
  const after = await t.run(ctx => ctx.db.get("admins", id));
  expect(after).toMatchObject({ firstName: "Marie", lastName: "Rivera-Smith", displayName: "Marie Rivera-Smith", username: "mrivera", avatarColor: before?.avatarColor });
  await admin.mutation(api.admins.updateStaff, { adminId: id, firstName: "Marie", lastName: "Rivera-Smith", password: "a-brand-new-password" });
  await expect(signIn(t)).rejects.toThrow();
  expect((await signIn(t, "mrivera", "a-brand-new-password")).tokens?.token).toBeTruthy();
  await expect(admin.mutation(api.admins.deleteStaff, { adminId })).rejects.toThrow(/own teacher account/);
  const history = await t.run(ctx => ctx.db.query("adminChanges").take(10));
  expect(JSON.stringify(history)).not.toContain("a-brand-new-password");
});

test("deletion removes identity, credentials and sessions while retaining named audit history and work", async () => {
  const { t, admin } = await setup();
  const id = await admin.mutation(api.admins.createStaff, credentials);
  const staff = (await t.run(ctx => ctx.db.get("admins", id)))!;
  const formerStaff = t.withIdentity({ subject: `${staff.userId}|old-session` });
  await signIn(t);
  await signIn(t);
  const records = await t.run(async ctx => {
    // A legacy audit entry has no actorName snapshot.
    const legacyLog = await ctx.db.insert("adminChanges", { actorId: staff.userId, at: 1, table: "settings", recordId: "historical", summary: "Legacy change" });
    const namedLog = await ctx.db.insert("adminChanges", { actorId: staff.userId, actorName: "Original name", at: 2, table: "settings", recordId: "historical", summary: "Named change" });
    const curriculumId = await ctx.db.insert("curricula", { name: "Preserved curriculum", group: "basic" });
    const dayId = await ctx.db.insert("days", { curriculumId, order: 1, topic: "Preserved lesson" });
    const assignmentId = await ctx.db.insert("assignments", { dayId, order: 1, type: "open", title: "Preserved assignment", status: "draft" });
    const revisionId = await ctx.db.insert("assignmentRevisions", { assignmentId, summary: "", instructions: "", starterFiles: [], parts: [], partialMin: 0, loopCheck: false, createdBy: staff.userId, createdAt: 1 });
    return { legacyLog, namedLog, revisionId };
  });
  const legacyBefore = await t.run(ctx => ctx.db.get("adminChanges", records.legacyLog));
  const namedBefore = await t.run(ctx => ctx.db.get("adminChanges", records.namedLog));
  const revisionBefore = await t.run(ctx => ctx.db.get("assignmentRevisions", records.revisionId));
  await admin.mutation(api.admins.deleteStaff, { adminId: id });
  await t.run(async ctx => {
    expect(await ctx.db.get("admins", id)).toBeNull();
    expect(await ctx.db.get("users", staff.userId)).toBeNull();
    expect(await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", staff.userId)).take(10)).toEqual([]);
    expect(await ctx.db.query("authSessions").withIndex("userId", q => q.eq("userId", staff.userId)).take(10)).toEqual([]);
    expect(await ctx.db.query("authRefreshTokens").take(10)).toEqual([]);
    expect(await ctx.db.get("adminChanges", records.legacyLog)).toEqual(legacyBefore);
    expect(await ctx.db.get("adminChanges", records.namedLog)).toEqual(namedBefore);
    expect(await ctx.db.get("assignmentRevisions", records.revisionId)).toEqual(revisionBefore);
  });
  await expect(signIn(t)).rejects.toThrow();
  await expect(formerStaff.query(api.admins.list, { paginationOpts })).rejects.toThrow(/Sign in/);
  await expect(formerStaff.mutation(api.admins.createStaff, credentials)).rejects.toThrow(/Sign in/);
  expect(await formerStaff.query(api.viewer.current, {})).toBeNull();
  // A new account reusing the username cannot inherit the old user's history or access.
  const replacement = await admin.mutation(api.admins.createStaff, { ...credentials, firstName: "Marie" });
  expect((await t.run(ctx => ctx.db.get("admins", replacement)))?.userId).not.toBe(staff.userId);
  const history = await admin.query(api.adminHistory.list, { paginationOpts });
  expect(history.page.find(row => row._id === records.legacyLog)?.actorName).toBe("Maria Rivera");
  expect(history.page.find(row => row._id === records.namedLog)?.actorName).toBe("Original name");
});

test("concurrent creates allocate distinct codes without orphaning accounts", async () => {
  const { t, admin } = await setup();
  const result = await Promise.allSettled([
    admin.mutation(api.admins.createStaff, credentials),
    admin.mutation(api.admins.createStaff, credentials),
  ]);
  expect(result.filter(item => item.status === "fulfilled")).toHaveLength(2);
  expect(await t.run(ctx => ctx.db.query("users").take(10))).toHaveLength(3);
  expect(await t.run(ctx => ctx.db.query("authAccounts").take(10))).toHaveLength(2);
  const names = (await admin.query(api.admins.list, { paginationOpts })).page.map(row => row.username);
  expect(names).toEqual(["mrivera", "mrivera1", "owner"]);
});


test("legacy teacher names and avatars can be displayed and edited without changing credentials", async () => {
  const { t, admin, adminId } = await setup();
  const original = (await admin.query(api.admins.list, { paginationOpts })).page[0];
  expect(original).toMatchObject({ firstName: "Owner", lastName: "", username: "owner" });
  expect(avatarColors).toContain(original.avatarColor);
  expect((await admin.query(api.admins.list, { paginationOpts })).page[0].avatarColor).toBe(original.avatarColor);
  const userId = await t.run(ctx => ctx.db.insert("users", { role: "admin" }));
  await t.run(ctx => ctx.db.insert("authAccounts", { userId, provider: "password", providerAccountId: "mrivera", secret: "reserved" }));
  const id = await admin.mutation(api.admins.createStaff, credentials);
  expect((await t.run(ctx => ctx.db.get("admins", id)))?.username).toBe("mrivera1");
  expect(adminId).toBeTruthy();
});
