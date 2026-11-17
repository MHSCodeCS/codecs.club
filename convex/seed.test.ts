import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { firstName, startsWithTitle } from "./lib/adminNames";
import { setupConvex } from "./test.setup";

async function seeded() {
  const t = setupConvex();
  await t.action(internal.admins.createAdmin, {
    username: "max",
    displayName: "Max",
    password: "correct-horse-battery",
  });
  await t.mutation(internal.seed.run, {});
  return t;
}

describe("admin names", () => {
  test("students see the first word, never a title", () => {
    expect(firstName("Sam Ortiz")).toBe("Sam");
    expect(firstName("  Max ")).toBe("Max");
    expect(firstName("Ms. Rivera")).toBe("Rivera");
    expect(startsWithTitle("Mr Lee")).toBe(true);
    expect(startsWithTitle("Mrinal")).toBe(false);
  });

  test("new admins and renames refuse a title", async () => {
    const t = await seeded();
    await expect(
      t.action(internal.admins.createAdmin, {
        username: "lee",
        displayName: "Mr. Lee",
        password: "correct-horse-battery",
      }),
    ).rejects.toThrow(/without a title/);
    await expect(
      t.mutation(internal.admins.setDisplayName, { username: "max", displayName: "Ms. Max" }),
    ).rejects.toThrow(/without a title/);
    await t.mutation(internal.admins.setDisplayName, { username: "max", displayName: "Max K" });
    const admin = await t.run((ctx) => ctx.db.query("admins").first());
    expect(admin?.displayName).toBe("Max K");
  });
});

describe("seed", () => {
  test("Python Fundamentals is 6 weeks and nobody has a seat", async () => {
    const t = await seeded();
    const { topics, seats, closes } = await t.run(async (ctx) => {
      const curriculum = (await ctx.db.query("curricula").collect()).find(
        (c) => c.name === "Python Fundamentals",
      )!;
      const days = await ctx.db
        .query("days")
        .withIndex("by_curriculumId_and_order", (q) => q.eq("curriculumId", curriculum._id))
        .collect();
      const students = await ctx.db.query("students").collect();
      const schedules = await ctx.db.query("lessonSchedules").collect();
      return {
        topics: days.map((d) => d.topic),
        seats: students.filter((s) => s.seatIndex !== undefined).length,
        closes: schedules.filter((s) => s.turnInClosesAt !== undefined).length,
      };
    });
    expect(topics).toEqual([
      "Hello, Python",
      "Variables",
      "Input and strings",
      "Conditionals",
      "Loops",
      "Lists and functions",
    ]);
    expect(seats).toBe(0);
    expect(closes).toBe(0);
  });

  test("applyCorrections updates an older 8-day deployment without losing work", async () => {
    const t = await seeded();
    // Recreate what the old seed left behind.
    const extraDays = await t.run(async (ctx) => {
      const curriculum = (await ctx.db.query("curricula").collect()).find(
        (c) => c.name === "Python Fundamentals",
      )!;
      const lists = await ctx.db
        .query("days")
        .withIndex("by_curriculumId_and_order", (q) =>
          q.eq("curriculumId", curriculum._id).eq("order", 6),
        )
        .unique();
      await ctx.db.patch("days", lists!._id, { topic: "Lists" });
      const ids = [
        await ctx.db.insert("days", { curriculumId: curriculum._id, order: 7, topic: "Functions" }),
        await ctx.db.insert("days", { curriculumId: curriculum._id, order: 8, topic: "Final project" }),
      ];
      for (const [i, student] of (await ctx.db.query("students").collect()).entries()) {
        await ctx.db.patch("students", student._id, { seatIndex: i });
      }
      for (const schedule of await ctx.db.query("lessonSchedules").collect()) {
        await ctx.db.patch("lessonSchedules", schedule._id, { turnInClosesAt: schedule.lessonAt + 1 });
      }
      const settings = (await ctx.db.query("settings").first())!;
      await ctx.db.patch("settings", settings._id, { turnInDays: 14, closeTime: "23:59" });
      return ids;
    });
    const workBefore = await t.run(async (ctx) => (await ctx.db.query("workspaces").collect()).length);

    const done = await t.mutation(internal.seed.applyCorrections, {});
    expect(done).toContain("Removed empty Day 7: Functions.");
    expect(done).toContain("Renamed Day 6 to “Lists and functions”.");

    const after = await t.run(async (ctx) => ({
      extra: await Promise.all(extraDays.map((id) => ctx.db.get("days", id))),
      seats: (await ctx.db.query("students").collect()).filter((s) => s.seatIndex !== undefined),
      closes: (await ctx.db.query("lessonSchedules").collect()).filter(
        (s) => s.turnInClosesAt !== undefined,
      ),
      settings: await ctx.db.query("settings").first(),
      work: (await ctx.db.query("workspaces").collect()).length,
    }));
    expect(after.extra).toEqual([null, null]);
    expect(after.seats).toHaveLength(0);
    expect(after.closes).toHaveLength(0);
    expect(after.settings).not.toHaveProperty("turnInDays");
    expect(after.settings).not.toHaveProperty("closeTime");
    expect(after.work).toBe(workBefore);
    expect(await t.mutation(internal.seed.applyCorrections, {})).toEqual(["Already up to date."]);
  });
});
