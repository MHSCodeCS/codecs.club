import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { setupConvex } from "./test.setup";

async function setup() {
  const t = setupConvex();
  const ids = await t.run(async ctx => {
    const admin = await ctx.db.insert("users", { role: "admin" });
    await ctx.db.insert("admins", { userId: admin, username: "teacher", displayName: "Teacher" });
    const user = await ctx.db.insert("users", { role: "student" });
    const curriculumId = await ctx.db.insert("curricula", { name: "Python", group: "basic" });
    const base = { userId: user, curriculumId, sinceYear: "2026-27" };
    const one = await ctx.db.insert("students", { ...base, firstName: "Ada", lastName: "L", loginCode: "ada", group: "basic", seatIndex: 0 });
    const two = await ctx.db.insert("students", { ...base, firstName: "Grace", lastName: "H", loginCode: "grace", group: "basic", seatIndex: 1 });
    const other = await ctx.db.insert("students", { ...base, firstName: "Alan", lastName: "T", loginCode: "alan", group: "advanced" });
    return { admin, user, one, two, other };
  });
  return { t, ...ids, admin: t.withIdentity({ subject: `${ids.admin}|test` }), student: t.withIdentity({ subject: `${ids.user}|test` }) };
}

test("layout editing is admin-only; swaps, removed desks and rotations persist atomically per group", async () => {
  const { t, admin, student, one, two } = await setup();
  await expect(t.query(api.classroomLayouts.get, { group: "basic" })).rejects.toThrow(/Sign in/);
  await expect(student.query(api.classroomLayouts.get, { group: "basic" })).rejects.toThrow(/Only admins/);
  const current = await admin.query(api.classroomLayouts.get, { group: "basic" });
  expect(current.desks).toHaveLength(24);
  const swap = { ...current, group: "basic" as const, desks: [{ seat: 0, x: -80, y: 40, rotation: 90 }, { seat: 1, x: 100, y: 40, rotation: 270 }], seating: [{ studentId: one, seat: 1 }, { studentId: two, seat: 0 }] };
  await expect(student.mutation(api.classroomLayouts.save, swap)).rejects.toThrow(/Only admins/);
  await admin.mutation(api.classroomLayouts.save, swap);
  const saved = await admin.query(api.classroomLayouts.get, { group: "basic" });
  expect(saved.desks).toEqual(swap.desks);
  expect((await t.run(ctx => ctx.db.get("students", one)))?.seatIndex).toBe(1);
  expect((await admin.query(api.classroomLayouts.get, { group: "advanced" })).desks).toHaveLength(24);
  await expect(admin.mutation(api.classroomLayouts.save, swap)).rejects.toThrow(/changed/);
  await admin.mutation(api.classroomLayouts.save, { ...saved, group: "basic", desks: [], seating: saved.seating.map(s => ({ ...s, seat: null })) });
  expect((await t.run(ctx => ctx.db.get("students", two)))?.seatIndex).toBeUndefined();
  expect((await admin.query(api.classroomLayouts.get, { group: "basic" })).desks).toEqual([]);
  await expect(admin.mutation(api.assistance.setSeat, { studentId: one, seatIndex: 1 })).rejects.toThrow(/not in the classroom/);
});

test("rejects duplicate seats, invalid geometry, foreign students and stale seating without partial writes", async () => {
  const { admin, one, two, other } = await setup();
  const current = await admin.query(api.classroomLayouts.get, { group: "basic" });
  const input = { ...current, group: "basic" as const };
  for (const bad of [
    { ...input, desks: [input.desks[0], input.desks[0]] },
    { ...input, desks: [{ ...input.desks[0], rotation: 45 }] },
    { ...input, desks: [{ ...input.desks[0], x: 5001 }] },
    { ...input, seating: [{ studentId: one, seat: 0 }, { studentId: two, seat: 0 }] },
    { ...input, seating: [{ studentId: other, seat: 0 }, { studentId: two, seat: 1 }] },
    { ...input, seating: [{ studentId: one, seat: 59 }, { studentId: two, seat: 1 }] },
  ]) await expect(admin.mutation(api.classroomLayouts.save, bad)).rejects.toThrow();
  expect(await admin.query(api.classroomLayouts.get, { group: "basic" })).toEqual(current);
  await admin.mutation(api.assistance.setSeat, { studentId: one, seatIndex: null });
  await expect(admin.mutation(api.classroomLayouts.save, input)).rejects.toThrow(/changed/);
});
