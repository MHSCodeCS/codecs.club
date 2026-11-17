import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvex } from "./test.setup";

/** convex-test identity for a Convex Auth user: subject is "userId|sessionId". */
function as(t: ReturnType<typeof setupConvex>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

async function setup() {
  const t = setupConvex();
  const adminUserId = await t.action(internal.admins.createAdmin, {
    username: "max",
    displayName: "Max",
    password: "correct-horse-battery",
  });
  await t.mutation(internal.seed.run, {});
  const jordan = await t.run(async (ctx) =>
    ctx.db
      .query("students")
      .withIndex("by_loginCode", (q) => q.eq("loginCode", "jsmith"))
      .unique(),
  );
  return { t, adminUserId, jordan: jordan! };
}

describe("access control", () => {
  test("admin queries reject anonymous callers", async () => {
    const { t } = await setup();
    await expect(t.query(api.adminStudents.roster, { group: "basic", now: Date.now() })).rejects.toThrow(
      /Sign in/,
    );
  });

  test("admin queries and mutations reject a student session", async () => {
    const { t, jordan } = await setup();
    const student = as(t, jordan.userId);
    await expect(student.query(api.adminStudents.roster, { group: "basic", now: Date.now() })).rejects.toThrow(
      /Only admins/,
    );
    await expect(
      student.mutation(api.adminStudents.updateStudent, {
        studentId: jordan._id,
        loginCode: "hacker",
        group: jordan.group,
        curriculumId: jordan.curriculumId,
      }),
    ).rejects.toThrow(/Only admins/);
  });

  test("student queries reject an admin session", async () => {
    const { t, adminUserId } = await setup();
    await expect(as(t, adminUserId).query(api.student.home, {})).rejects.toThrow(/Only students/);
  });

  test("a student sees their own track without drafts", async () => {
    const { t, jordan } = await setup();
    const home = await as(t, jordan.userId).query(api.student.home, {});
    expect(home.student.loginCode).toBe("jsmith");
    expect(home.days).toHaveLength(6);
    const loops = home.days.find((d) => d.topic === "Loops")!;
    expect(loops.assignments.map((a) => a.title)).toEqual(["Countdown", "Forever greeter", "Loop art"]);
    expect(home.latestFeedback).toMatchObject({ authorName: "Max" });
    expect(home.latestFeedback?.body).toMatch(/favorite color/);
  });

  test("moving a student keeps identity and records the change", async () => {
    const { t, adminUserId, jordan } = await setup();
    const admin = as(t, adminUserId);
    const roster = await admin.query(api.adminStudents.roster, { group: "basic", now: Date.now() });
    const advanced = roster.curricula.find((c) => c.group === "advanced")!;
    await admin.mutation(api.adminStudents.updateStudent, {
      studentId: jordan._id,
      loginCode: "jsmith",
      group: "advanced",
      curriculumId: advanced._id,
    });
    const after = await t.run((ctx) => ctx.db.get("students", jordan._id));
    expect(after).toMatchObject({ userId: jordan.userId, loginCode: "jsmith", group: "advanced" });
    const workspaces = await t.run((ctx) =>
      ctx.db
        .query("workspaces")
        .withIndex("by_studentId_and_updatedAt", (q) => q.eq("studentId", jordan._id))
        .take(100),
    );
    // Old work keeps its historical group context.
    expect(workspaces.every((w) => w.group === "basic")).toBe(true);
    const history = await admin.query(api.adminHistory.list, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(history.page[0]?.summary).toBe("Updated Jordan Smith");
  });

  test("a login code already in use is refused", async () => {
    const { t, adminUserId, jordan } = await setup();
    await expect(
      as(t, adminUserId).mutation(api.adminStudents.updateStudent, {
        studentId: jordan._id,
        loginCode: "jsmith1",
        group: jordan.group,
        curriculumId: jordan.curriculumId,
      }),
    ).rejects.toThrow(/already used/);
  });
});
