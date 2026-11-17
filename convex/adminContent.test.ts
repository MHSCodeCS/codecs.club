import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { DraftContent } from "./lib/assignmentRules";
import { MAX_COVER_BYTES } from "./lib/covers";
import { zonedTimeToUtc } from "./lib/time";
import { setupConvex } from "./test.setup";

/**
 * Phase 7, admin content: assignment authoring with drafts, publishing and
 * task versions (D08), lesson days opening on their date (D04), cover images
 * and curriculum days.
 */

type T = ReturnType<typeof setupConvex>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

/** Wall-clock Pacific time as UTC ms. */
const pt = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  zonedTimeToUtc({ year, month, day, hour, minute }, "America/Los_Angeles");

async function setup() {
  const t = setupConvex();
  const adminUserId = await t.action(internal.admins.createAdmin, {
    username: "max",
    displayName: "Max",
    password: "correct-horse-battery",
  });
  await t.mutation(internal.seed.run, {});
  const student = async (loginCode: string) =>
    (await t.run(async (ctx) =>
      ctx.db
        .query("students")
        .withIndex("by_loginCode", (q) => q.eq("loginCode", loginCode))
        .unique(),
    ))!;
  const assignment = async (title: string) =>
    (await t.run(async (ctx) => {
      for await (const a of ctx.db.query("assignments")) if (a.title === title) return a;
      return null;
    }))!;
  const day = async (topic: string) =>
    (await t.run(async (ctx) => {
      for await (const d of ctx.db.query("days")) if (d.topic === topic) return d;
      return null;
    }))!;
  const workspaceOf = (studentId: Id<"students">, assignmentId: Id<"assignments">) =>
    t.run(async (ctx) =>
      ctx.db
        .query("workspaces")
        .withIndex("by_studentId_and_assignmentId", (q) =>
          q.eq("studentId", studentId).eq("assignmentId", assignmentId),
        )
        .unique(),
    );
  const changes = () =>
    t.run(async (ctx) => (await ctx.db.query("adminChanges").take(500)).map((c) => c.summary));
  return {
    t,
    admin: as(t, adminUserId),
    jordan: await student("jsmith"),
    priya: await student("ppatel"),
    grace: await student("glee"),
    student,
    assignment,
    day,
    workspaceOf,
    changes,
  };
}

const blankDraft: DraftContent = {
  title: "Skip counter",
  type: "guided",
  summary: "",
  instructions: "",
  expectedOutput: "",
  starterFiles: [{ name: "main.py", content: "" }],
  parts: [],
  partialMin: 0,
  loopCheck: false,
  checkInput: "",
};

/** Saves a complete guided task and returns the editor's new base. */
async function saveTask(
  admin: ReturnType<typeof as>,
  assignmentId: Id<"assignments">,
  draft: Partial<DraftContent>,
) {
  const current = (await admin.query(api.adminAssignments.get, { assignmentId }))!;
  return await admin.mutation(api.adminAssignments.saveDraft, {
    assignmentId,
    baseRevisionId: current.draft.revisionId,
    baseSavedAt: current.draft.savedAt,
    draft: { ...current.draft.content, ...draft },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("admin content authorization", () => {
  test("students and anonymous callers are refused every authoring function", async () => {
    const { t, jordan, assignment, day } = await setup();
    const countdown = await assignment("Countdown");
    const loops = await day("Loops");
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    for (const [caller, refusal] of [
      [as(t, jordan.userId), /Only admins/],
      [t, /Sign in/],
    ] as const) {
      await expect(
        caller.query(api.adminAssignments.get, { assignmentId: countdown._id }),
      ).rejects.toThrow(refusal);
      await expect(
        caller.mutation(api.adminAssignments.create, { dayId: loops._id, title: "X", type: "guided" }),
      ).rejects.toThrow(refusal);
      await expect(
        caller.mutation(api.adminAssignments.saveDraft, {
          assignmentId: countdown._id,
          baseRevisionId: countdown.currentRevisionId!,
          baseSavedAt: 0,
          draft: blankDraft,
        }),
      ).rejects.toThrow(refusal);
      await expect(
        caller.mutation(api.adminAssignments.publish, {
          assignmentId: countdown._id,
          revisionId: countdown.currentRevisionId!,
        }),
      ).rejects.toThrow(refusal);
      for (const fn of [api.adminAssignments.unpublish, api.adminAssignments.remove]) {
        await expect(caller.mutation(fn, { assignmentId: countdown._id })).rejects.toThrow(refusal);
      }
      await expect(
        caller.mutation(api.adminAssignments.move, { assignmentId: countdown._id, direction: "up" }),
      ).rejects.toThrow(refusal);
      await expect(caller.mutation(api.adminCurriculum.generateCoverUploadUrl, {})).rejects.toThrow(
        refusal,
      );
      await expect(
        caller.mutation(api.adminCurriculum.setCover, { dayId: loops._id, storageId }),
      ).rejects.toThrow(refusal);
      for (const fn of [api.adminCurriculum.removeCover, api.adminCurriculum.removeDay]) {
        await expect(caller.mutation(fn, { dayId: loops._id })).rejects.toThrow(refusal);
      }
      await expect(
        caller.mutation(api.adminCurriculum.addDay, { curriculumId: loops.curriculumId, topic: "X" }),
      ).rejects.toThrow(refusal);
      await expect(
        caller.mutation(api.adminCurriculum.moveDay, { dayId: loops._id, direction: "up" }),
      ).rejects.toThrow(refusal);
    }
    // Nothing changed.
    expect((await t.run((ctx) => ctx.db.get("days", loops._id)))?.order).toBe(5);
    expect((await t.run((ctx) => ctx.db.get("assignments", countdown._id)))?.status).toBe("published");
  });
});

describe("assignment drafts and publishing", () => {
  test("a new draft stays hidden from students until published, then unpublishing keeps their work", async () => {
    const { t, admin, jordan, grace, day, workspaceOf, changes } = await setup();
    const loops = await day("Loops");
    const id = await admin.mutation(api.adminAssignments.create, {
      dayId: loops._id,
      title: "  Even numbers ",
      type: "guided",
    });
    const created = (await admin.query(api.adminAssignments.get, { assignmentId: id }))!;
    expect(created.assignment).toMatchObject({ title: "Even numbers", status: "draft", order: 5 });
    expect(created.siblings.map((s) => s.title)).toEqual([
      "Countdown",
      "Forever greeter",
      "Loop art",
      "Skip counter",
      "Even numbers",
    ]);

    const student = as(t, grace.userId);
    const titles = async () =>
      (await student.query(api.student.day, { dayId: loops._id }))!.assignments.map((a) => a.title);
    expect(await titles()).not.toContain("Even numbers");
    expect(await student.query(api.workspaces.get, { assignmentId: id })).toBeNull();
    await expect(student.mutation(api.workspaces.open, { assignmentId: id })).rejects.toThrow(
      /isn’t available/,
    );

    // An incomplete task can be saved but not published.
    await saveTask(admin, id, { instructions: "Print the even numbers up to 10." });
    const draft = (await admin.query(api.adminAssignments.get, { assignmentId: id }))!;
    await expect(
      admin.mutation(api.adminAssignments.publish, { assignmentId: id, revisionId: draft.draft.revisionId }),
    ).rejects.toThrow(/Add at least one part/);

    await saveTask(admin, id, {
      summary: "Count by twos.",
      starterFiles: [
        { name: "main.py", content: "# even numbers\n" },
        { name: "helpers.py", content: "STEP = 2\n" },
      ],
      parts: [
        { name: "Starts at 2", kind: "begins", expected: "2" },
        { name: "Ends at 10", kind: "ends", expected: "10" },
      ],
      partialMin: 1,
      expectedOutput: "2\n4\n6\n8\n10",
    });
    const ready = (await admin.query(api.adminAssignments.get, { assignmentId: id }))!;
    expect(
      await admin.mutation(api.adminAssignments.publish, {
        assignmentId: id,
        revisionId: ready.draft.revisionId,
      }),
    ).toMatchObject({ version: 1 });

    expect(await titles()).toContain("Even numbers");
    const workspaceId = await student.mutation(api.workspaces.open, { assignmentId: id });
    const opened = (await student.query(api.workspaces.get, { assignmentId: id }))!;
    expect(opened.assignment.instructions).toBe("Print the even numbers up to 10.");
    expect(opened.workspace?.files.map((f) => f.name)).toEqual(["main.py", "helpers.py"]);

    await admin.mutation(api.adminAssignments.unpublish, { assignmentId: id });
    expect(await titles()).not.toContain("Even numbers");
    // Grace's work is kept and still opens, checks and turns in.
    expect((await student.query(api.workspaces.get, { assignmentId: id }))?.workspace?._id).toBe(
      workspaceId,
    );
    const prepared = await student.mutation(api.checks.prepare, { workspaceId });
    expect(prepared.revisionId).toBe(ready.draft.revisionId);
    await student.mutation(api.submissions.turnIn, { workspaceId, idempotencyKey: "grace-even-1" });
    // Someone who never opened it can't start it now.
    expect(await as(t, jordan.userId).query(api.workspaces.get, { assignmentId: id })).toBeNull();
    expect(await workspaceOf(jordan._id, id)).toBeNull();

    // With work on it, it can't be removed.
    await expect(admin.mutation(api.adminAssignments.remove, { assignmentId: id })).rejects.toThrow(
      /Students have work/,
    );
    expect(await changes()).toEqual(
      expect.arrayContaining([
        "Created Even numbers on Day 5",
        "Saved a draft of Even numbers",
        "Published Even numbers on Day 5",
        "Unpublished Even numbers",
      ]),
    );
  });

  test("drafts are validated on the server with bounded sizes", async () => {
    const { admin, assignment } = await setup();
    const skip = await assignment("Skip counter");
    const bad: Array<[Partial<DraftContent>, RegExp]> = [
      [{ title: " " }, /title/],
      [{ title: "x".repeat(81) }, /under 80/],
      [{ instructions: "x".repeat(5001) }, /instructions under/],
      [{ starterFiles: [{ name: "my file.py", content: "" }] }, /no spaces/],
      [{ starterFiles: [{ name: "a.py", content: "" }, { name: "A.py", content: "" }] }, /two starter files/],
      [{ starterFiles: [{ name: "big.py", content: "x".repeat(100_001) }] }, /100 KB/],
      [
        { starterFiles: Array.from({ length: 11 }, (_, i) => ({ name: `f${i}.py`, content: "" })) },
        /at most 10 starter/,
      ],
      [{ parts: Array.from({ length: 21 }, () => ({ name: "p", kind: "ends" as const, expected: "x" })) }, /at most 20 parts/],
      [{ partialMin: 7 }, /between 0 and all/],
      [{ checkInput: "a\n".repeat(101) + "b" }, /at most 100 lines/],
    ];
    for (const [draft, message] of bad) {
      await expect(saveTask(admin, skip._id, draft)).rejects.toThrow(message);
    }
    // An unreachable partial rule saves as a draft but can't be published.
    await saveTask(admin, skip._id, { partialMin: 3 });
    const current = (await admin.query(api.adminAssignments.get, { assignmentId: skip._id }))!;
    await expect(
      admin.mutation(api.adminAssignments.publish, {
        assignmentId: skip._id,
        revisionId: current.draft.revisionId,
      }),
    ).rejects.toThrow(/fewer than all 3/);
  });

  test("a save over someone else's newer save is refused", async () => {
    const { admin, assignment } = await setup();
    const skip = await assignment("Skip counter");
    const opened = (await admin.query(api.adminAssignments.get, { assignmentId: skip._id }))!;
    await saveTask(admin, skip._id, { summary: "First admin" });
    await expect(
      admin.mutation(api.adminAssignments.saveDraft, {
        assignmentId: skip._id,
        baseRevisionId: opened.draft.revisionId,
        baseSavedAt: opened.draft.savedAt,
        draft: { ...opened.draft.content, summary: "Second admin" },
      }),
    ).rejects.toThrow(/Someone else saved/);
  });

  test("assignments reorder on their day, and a draft without work is removed with its revisions", async () => {
    const { t, admin, assignment, changes } = await setup();
    const skip = await assignment("Skip counter");
    await admin.mutation(api.adminAssignments.move, { assignmentId: skip._id, direction: "up" });
    const order = async () =>
      (await admin.query(api.adminAssignments.get, { assignmentId: skip._id }))!.siblings.map(
        (s) => s.title,
      );
    expect(await order()).toEqual(["Countdown", "Forever greeter", "Skip counter", "Loop art"]);
    // Moving past the end does nothing.
    const countdown = await assignment("Countdown");
    await admin.mutation(api.adminAssignments.move, { assignmentId: countdown._id, direction: "up" });
    expect(await order()).toEqual(["Countdown", "Forever greeter", "Skip counter", "Loop art"]);

    await expect(
      admin.mutation(api.adminAssignments.remove, { assignmentId: countdown._id }),
    ).rejects.toThrow(/Unpublish it first/);
    const loopArt = await assignment("Loop art");
    await admin.mutation(api.adminAssignments.remove, { assignmentId: skip._id });
    const left = await t.run(async (ctx) => ({
      assignment: await ctx.db.get("assignments", skip._id),
      revisions: await ctx.db
        .query("assignmentRevisions")
        .withIndex("by_assignmentId", (q) => q.eq("assignmentId", skip._id))
        .take(10),
      loopArt: await ctx.db.get("assignments", loopArt._id),
    }));
    expect(left.assignment).toBeNull();
    expect(left.revisions).toEqual([]);
    expect(left.loopArt?.order).toBe(3);
    expect(await changes()).toEqual(
      expect.arrayContaining(["Moved Skip counter up on Day 5", "Removed the draft Skip counter from Day 5"]),
    );
  });
});

describe("task versions (D08)", () => {
  test("publishing an edit makes a new version; earlier checks and turn-ins keep theirs", async () => {
    const { t, admin, jordan, priya, grace, assignment, workspaceOf } = await setup();
    const countdown = await assignment("Countdown");
    const v1 = countdown.publishedRevisionId!;
    const jordanWork = (await workspaceOf(jordan._id, countdown._id))!;
    const jordanStudent = as(t, jordan.userId);
    const checkBefore = (await jordanStudent.query(api.checks.latest, { workspaceId: jordanWork._id }))!;
    const filesBefore = await jordanStudent.query(api.workspaces.get, { assignmentId: countdown._id });

    // Saving edits starts a new draft revision; students still see version 1.
    await saveTask(admin, countdown._id, {
      instructions: "Count down from **5** to **1**, then print `Liftoff!`",
      starterFiles: [{ name: "main.py", content: "# Countdown from 5\n" }],
      parts: [
        { name: "Counts down from 5", kind: "begins", expected: "5" },
        { name: "Ends with Liftoff!", kind: "ends", expected: "Liftoff!" },
      ],
      partialMin: 1,
    });
    const edited = (await admin.query(api.adminAssignments.get, { assignmentId: countdown._id }))!;
    expect(edited.draft.revisionId).not.toBe(v1);
    expect(edited.assignment).toMatchObject({ publishedVersion: 1, unpublishedChanges: true });
    expect(
      (await jordanStudent.query(api.workspaces.get, { assignmentId: countdown._id }))!.assignment
        .instructions,
    ).toContain("**10**");

    expect(
      await admin.mutation(api.adminAssignments.publish, {
        assignmentId: countdown._id,
        revisionId: edited.draft.revisionId,
      }),
    ).toMatchObject({ version: 2 });
    // The published revision is never edited again: the next save starts version 3's draft.
    await saveTask(admin, countdown._id, { summary: "Count down from 5." });
    const after = await t.run(async (ctx) => ({
      v1: await ctx.db.get("assignmentRevisions", v1),
      v2: await ctx.db.get("assignmentRevisions", edited.draft.revisionId),
      assignment: await ctx.db.get("assignments", countdown._id),
    }));
    expect(after.v1?.parts).toHaveLength(3);
    expect(after.v2).toMatchObject({ version: 2, summary: "Count down from 10, then print Liftoff!" });
    expect(after.assignment?.publishedRevisionId).toBe(edited.draft.revisionId);
    expect(after.assignment?.currentRevisionId).not.toBe(edited.draft.revisionId);

    // Jordan's files are untouched and his old check keeps its result, labeled older.
    expect(await jordanStudent.query(api.workspaces.get, { assignmentId: countdown._id })).toMatchObject({
      workspace: { files: filesBefore!.workspace!.files },
      assignment: { instructions: expect.stringContaining("**5**") },
    });
    expect(await jordanStudent.query(api.checks.latest, { workspaceId: jordanWork._id })).toEqual({
      ...checkBefore,
      currentTask: false,
      taskVersion: 1,
    });
    // New checks use the new rules (no automatic re-evaluation of old ones).
    const prepared = await jordanStudent.mutation(api.checks.prepare, { workspaceId: jordanWork._id });
    expect(prepared.revisionId).toBe(edited.draft.revisionId);
    const result = await jordanStudent.mutation(api.checks.record, {
      workspaceId: jordanWork._id,
      versionId: prepared.versionId,
      revisionId: prepared.revisionId,
      output: "10\n8\n6\n4\n2\nLiftoff!\n",
      outputTruncated: false,
      runOutcome: "ok",
    });
    expect(result.parts.map((p) => p.name)).toEqual(["Counts down from 5", "Ends with Liftoff!"]);
    expect(await jordanStudent.query(api.checks.latest, { workspaceId: jordanWork._id })).toMatchObject({
      currentTask: true,
      taskVersion: 2,
    });

    // Priya's attempt 2 was turned in under version 1: labeled on her card and in Review.
    const priyaWork = (await workspaceOf(priya._id, countdown._id))!;
    const card = await as(t, priya.userId).query(api.submissions.forWorkspace, {
      workspaceId: priyaWork._id,
    });
    expect(card.latest).toMatchObject({ attempt: 2, olderTask: true });
    const review = await admin.query(api.review.attempt, {
      assignmentId: countdown._id,
      studentId: priya._id,
    });
    expect(review?.selected).toMatchObject({
      attempt: 2,
      taskVersion: 1,
      currentTaskVersion: 2,
      olderTask: true,
      expectedOutput: "10\n9\n8\n…\n1\nLiftoff!",
      check: { taskVersion: 1 },
    });
    expect(review?.selected?.expectedParts).toHaveLength(3);

    // A new turn-in is judged with version 2.
    await as(t, priya.userId).mutation(api.submissions.turnIn, {
      workspaceId: priyaWork._id,
      idempotencyKey: "priya-countdown-3",
    });
    expect(
      (await as(t, priya.userId).query(api.submissions.forWorkspace, { workspaceId: priyaWork._id }))
        .latest,
    ).toMatchObject({ attempt: 3, olderTask: false });
    expect(
      (await admin.query(api.review.attempt, { assignmentId: countdown._id, studentId: priya._id }))
        ?.selected,
    ).toMatchObject({ attempt: 3, taskVersion: 2, olderTask: false });

    // The new starter file only reaches workspaces created from now on.
    const graceWorkspace = await as(t, grace.userId).mutation(api.workspaces.open, {
      assignmentId: countdown._id,
    });
    const graceFiles = await t.run((ctx) =>
      ctx.db
        .query("workFiles")
        .withIndex("by_workspaceId_and_name", (q) => q.eq("workspaceId", graceWorkspace))
        .take(5),
    );
    expect(graceFiles.map((f) => f.content)).toEqual(["# Countdown from 5\n"]);
  });

  test("publishing without changes after unpublishing keeps the same version", async () => {
    const { admin, assignment } = await setup();
    const countdown = await assignment("Countdown");
    await admin.mutation(api.adminAssignments.unpublish, { assignmentId: countdown._id });
    expect(
      await admin.mutation(api.adminAssignments.publish, {
        assignmentId: countdown._id,
        revisionId: countdown.currentRevisionId!,
      }),
    ).toMatchObject({ version: 1 });
  });
});

describe("lesson days open on their date (D04)", () => {
  test("a future day shows as upcoming but can't be opened until its date", async () => {
    const { t, grace, day, assignment } = await setup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(pt(2026, 10, 20)); // Day 5 was Oct 15; Day 6 is Thu Oct 22.
    const student = as(t, grace.userId);
    const lists = await day("Lists and functions");
    const shopping = await assignment("Shopping list");

    const home = await student.query(api.student.home, {});
    const track = new Map(home.days.map((d) => [d.topic, d]));
    expect(track.get("Loops")).toMatchObject({ open: true });
    expect(track.get("Loops")?.assignments.length).toBeGreaterThan(0);
    expect(track.get("Lists and functions")).toMatchObject({ open: false, assignments: [] });
    expect(track.get("Lists and functions")?.lessonAt).toBe(pt(2026, 10, 22, 16));

    expect(await student.query(api.student.day, { dayId: lists._id })).toMatchObject({
      day: { topic: "Lists and functions", open: false, slidesUrl: null, coverUrl: null },
      assignments: [],
    });
    expect(await student.query(api.workspaces.get, { assignmentId: shopping._id })).toBeNull();
    await expect(
      student.mutation(api.workspaces.open, { assignmentId: shopping._id }),
    ).rejects.toThrow(/isn’t available/);

    // It opens at the start of its lesson date in Pacific time, before the lesson itself.
    vi.setSystemTime(pt(2026, 10, 22, 0, 5));
    expect(await student.query(api.student.day, { dayId: lists._id })).toMatchObject({
      day: { open: true },
      assignments: [expect.objectContaining({ title: "Shopping list" })],
    });
    await student.mutation(api.workspaces.open, { assignmentId: shopping._id });
  });

  test("queries follow the school clock the cron advances", async () => {
    const { t, grace, day } = await setup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(pt(2026, 10, 21, 23, 50));
    await t.mutation(internal.schoolClock.advance, {});
    const student = as(t, grace.userId);
    const lists = await day("Lists and functions");
    const isOpen = async () =>
      (await student.query(api.student.day, { dayId: lists._id }))!.day.open;
    expect(await isOpen()).toBe(false);
    vi.setSystemTime(pt(2026, 10, 22, 0, 5));
    // Until the cron moves the date, queries keep yesterday's answer…
    expect(await isOpen()).toBe(false);
    await t.mutation(internal.schoolClock.advance, {});
    // …and then the day opens.
    expect(await isOpen()).toBe(true);
    const clocks = await t.run((ctx) => ctx.db.query("schoolClock").take(5));
    expect(clocks).toEqual([expect.objectContaining({ today: "2026-10-22" })]);
  });

  test("unscheduled days aren't open", async () => {
    const { t, admin, grace, day } = await setup();
    const loops = await day("Loops");
    const dayId = await admin.mutation(api.adminCurriculum.addDay, {
      curriculumId: loops.curriculumId,
      topic: "Review day",
    });
    const id = await admin.mutation(api.adminAssignments.create, {
      dayId,
      title: "Recap",
      type: "open",
    });
    await saveTask(admin, id, { instructions: "Make anything you like." });
    const draft = (await admin.query(api.adminAssignments.get, { assignmentId: id }))!;
    await admin.mutation(api.adminAssignments.publish, { assignmentId: id, revisionId: draft.draft.revisionId });

    const student = as(t, grace.userId);
    expect(await student.query(api.student.day, { dayId })).toMatchObject({
      day: { lessonAt: null, open: false },
      assignments: [],
    });
    await expect(student.mutation(api.workspaces.open, { assignmentId: id })).rejects.toThrow(
      /isn’t available/,
    );
  });

  test("a student with work on a day keeps it when its date moves later or is cleared (D13)", async () => {
    const { t, admin, jordan, grace, day, assignment, workspaceOf } = await setup();
    const loops = await day("Loops");
    const countdown = await assignment("Countdown");
    const loopArt = await assignment("Loop art");
    await admin.mutation(api.adminCurriculum.setSchedule, {
      dayId: loops._id,
      year: "2026-27",
      date: "2026-12-03",
      time: "16:00",
    });

    // Grace has no work on Loops: it's closed to her now.
    const graceDay = await as(t, grace.userId).query(api.student.day, { dayId: loops._id });
    expect(graceDay).toMatchObject({ day: { open: false }, assignments: [] });

    // Jordan has Countdown work: the whole day stays open, check and turn-in work.
    const student = as(t, jordan.userId);
    const jordanDay = await student.query(api.student.day, { dayId: loops._id });
    expect(jordanDay?.day.open).toBe(true);
    expect(jordanDay?.assignments.map((a) => a.title)).toEqual([
      "Countdown",
      "Forever greeter",
      "Loop art",
    ]);
    const workspaceId = (await workspaceOf(jordan._id, countdown._id))!._id;
    await student.mutation(api.checks.prepare, { workspaceId });
    await student.mutation(api.submissions.turnIn, { workspaceId, idempotencyKey: "jordan-kept-1" });
    await student.mutation(api.workspaces.open, { assignmentId: loopArt._id });

    // Clearing the date keeps it open for him too.
    await t.run(async (ctx) => {
      const schedule = await ctx.db
        .query("lessonSchedules")
        .withIndex("by_dayId_and_year", (q) => q.eq("dayId", loops._id).eq("year", "2026-27"))
        .unique();
      await ctx.db.delete("lessonSchedules", schedule!._id);
    });
    expect(await student.query(api.student.day, { dayId: loops._id })).toMatchObject({
      day: { lessonAt: null, open: true },
    });
    expect(
      (await as(t, grace.userId).query(api.student.home, {})).days.find((d) => d.topic === "Loops"),
    ).toMatchObject({ open: false, lessonAt: null });
  });
});

describe("cover images", () => {
  /** Stores a file the way an upload would, with its content type. */
  async function upload(t: T, contentType: string, size = 1000) {
    return await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob([new Uint8Array(size)]));
      // convex-test doesn't record the upload's type; a real upload does.
      await ctx.db.patch("_storage" as "days", storageId as unknown as Id<"days">, {
        contentType,
      } as Partial<Doc<"days">>);
      return storageId;
    });
  }
  const stored = (t: T, id: Id<"_storage">) => t.run((ctx) => ctx.db.system.get("_storage", id));

  test("covers are type- and size-checked, replace and remove their files, and reach students", async () => {
    const { t, admin, jordan, day, changes } = await setup();
    const loops = await day("Loops");
    expect(await admin.mutation(api.adminCurriculum.generateCoverUploadUrl, {})).toMatch(/^https:/);

    const text = await upload(t, "text/plain");
    expect(await admin.mutation(api.adminCurriculum.setCover, { dayId: loops._id, storageId: text })).toEqual({
      ok: false,
      message: "Use a PNG, JPEG, WebP or GIF image.",
    });
    expect(await stored(t, text)).toBeNull();
    const svg = await upload(t, "image/svg+xml");
    expect(
      await admin.mutation(api.adminCurriculum.setCover, { dayId: loops._id, storageId: svg }),
    ).toMatchObject({ ok: false });
    const huge = await upload(t, "image/png", MAX_COVER_BYTES + 1);
    expect(await admin.mutation(api.adminCurriculum.setCover, { dayId: loops._id, storageId: huge })).toEqual({
      ok: false,
      message: "Use an image under 5 MB.",
    });
    expect(await stored(t, huge)).toBeNull();

    const first = await upload(t, "image/png");
    expect(
      await admin.mutation(api.adminCurriculum.setCover, { dayId: loops._id, storageId: first }),
    ).toEqual({ ok: true });
    const lesson = await as(t, jordan.userId).query(api.student.day, { dayId: loops._id });
    expect(lesson?.day.coverUrl).toMatch(/^https:\/\//);

    // Another day can't take the same file.
    const hello = await day("Hello, Python");
    await expect(
      admin.mutation(api.adminCurriculum.setCover, { dayId: hello._id, storageId: first }),
    ).rejects.toThrow(/another day’s cover/);

    const second = await upload(t, "image/jpeg");
    await admin.mutation(api.adminCurriculum.setCover, { dayId: loops._id, storageId: second });
    expect(await stored(t, first)).toBeNull();
    expect((await t.run((ctx) => ctx.db.get("days", loops._id)))?.coverImageId).toBe(second);

    await admin.mutation(api.adminCurriculum.removeCover, { dayId: loops._id });
    expect(await stored(t, second)).toBeNull();
    expect((await t.run((ctx) => ctx.db.get("days", loops._id)))?.coverImageId).toBeUndefined();
    expect(await changes()).toEqual(
      expect.arrayContaining([
        "Added the cover image of Day 5",
        "Replaced the cover image of Day 5",
        "Removed the cover image of Day 5",
      ]),
    );
  });
});

describe("curriculum days", () => {
  test("days are added at the end, reordered, and only empty days are removed", async () => {
    const { t, admin, day, changes } = await setup();
    const loops = await day("Loops");
    const topics = async () =>
      (await admin.query(api.adminCurriculum.overview, { group: "basic" })).days.map(
        (d) => `${d.order} ${d.topic}`,
      );
    const dayId = await admin.mutation(api.adminCurriculum.addDay, {
      curriculumId: loops.curriculumId,
      topic: " Final project ",
    });
    expect((await topics()).at(-1)).toBe("7 Final project");
    await admin.mutation(api.adminCurriculum.moveDay, { dayId, direction: "up" });
    expect((await topics()).slice(-2)).toEqual(["6 Final project", "7 Lists and functions"]);

    // Days with assignments can't be removed.
    await expect(admin.mutation(api.adminCurriculum.removeDay, { dayId: loops._id })).rejects.toThrow(
      /Only empty days/,
    );
    // Days whose lesson had attendance can't either.
    await admin.mutation(api.adminCurriculum.setSchedule, {
      dayId,
      year: "2026-27",
      date: "2026-10-29",
      time: "16:00",
    });
    const attendance = await t.run(async (ctx) => {
      const schedule = (await ctx.db
        .query("lessonSchedules")
        .withIndex("by_dayId_and_year", (q) => q.eq("dayId", dayId).eq("year", "2026-27"))
        .unique())!;
      const student = (await ctx.db.query("students").first())!;
      const admin = (await ctx.db.query("admins").first())!;
      return await ctx.db.insert("attendance", {
        studentId: student._id,
        scheduleId: schedule._id,
        status: "present",
        markedBy: admin.userId,
        markedAt: Date.now(),
      });
    });
    await expect(admin.mutation(api.adminCurriculum.removeDay, { dayId })).rejects.toThrow(
      /Attendance was taken/,
    );
    await t.run((ctx) => ctx.db.delete("attendance", attendance));

    await admin.mutation(api.adminCurriculum.removeDay, { dayId });
    expect(await topics()).toEqual([
      "1 Hello, Python",
      "2 Variables",
      "3 Input and strings",
      "4 Conditionals",
      "5 Loops",
      "6 Lists and functions",
    ]);
    const schedules = await t.run((ctx) =>
      ctx.db
        .query("lessonSchedules")
        .withIndex("by_dayId_and_year", (q) => q.eq("dayId", dayId))
        .take(5),
    );
    expect(schedules).toEqual([]);
    expect(await changes()).toEqual(
      expect.arrayContaining([
        "Added Day 7: Final project to Python Fundamentals",
        "Moved Final project from Day 7 to Day 6",
        "Removed Day 6: Final project from Python Fundamentals",
      ]),
    );
  });
});
