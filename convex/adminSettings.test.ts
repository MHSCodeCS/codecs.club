import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { setupConvex } from "./test.setup";

test("only admins can read school settings; legacy deadlines are not exposed", async () => {
  const t = setupConvex();
  const userId = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { role: "admin" });
    await ctx.db.insert("admins", { userId, username: "max", displayName: "Max" });
    await ctx.db.insert("settings", { currentYear: "2026-27", timeZone: "America/Chicago", turnInDays: 14, closeTime: "23:59" });
    return userId;
  });
  await expect(t.query(api.adminSettings.get, {})).rejects.toThrow(/Sign in/);
  const studentId = await t.run(ctx => ctx.db.insert("users", { role: "student" }));
  await expect(t.withIdentity({ subject: `${studentId}|session` }).query(api.adminSettings.get, {})).rejects.toThrow(/Only admins/);
  const admin = t.withIdentity({ subject: `${userId}|session` });
  expect(await admin.query(api.adminSettings.get, {})).toEqual({ currentYear: "2026-27", timeZone: "America/Chicago" });
  expect(await t.run(ctx => ctx.db.query("adminChanges").take(10))).toEqual([]);
});
