import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvex } from "./test.setup";

function as(t: ReturnType<typeof setupConvex>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

const FIXED = "for n in range(10, 0, -1):\n    print(n)\nprint('Liftoff!')\n";

async function setup() {
  const t = setupConvex();
  const adminUserId = await t.action(internal.admins.createAdmin, {
    username: "max",
    displayName: "Max",
    password: "correct-horse-battery",
  });
  await t.mutation(internal.seed.run, {});
  const student = async (loginCode: string) =>
    (await t.run((ctx) =>
      ctx.db
        .query("students")
        .withIndex("by_loginCode", (q) => q.eq("loginCode", loginCode))
        .unique(),
    ))!;
  const countdown = (await t.run(async (ctx) => {
    for await (const a of ctx.db.query("assignments")) if (a.title === "Countdown") return a;
    return null;
  }))!;
  const workspaceOf = async (studentId: Id<"students">) =>
    (await t.run((ctx) =>
      ctx.db
        .query("workspaces")
        .withIndex("by_studentId_and_assignmentId", (q) =>
          q.eq("studentId", studentId).eq("assignmentId", countdown._id),
        )
        .unique(),
    ))!;
  /** Moves Countdown's lesson date (null removes it). */
  const setLessonDate = (lessonAt: number | null) =>
    t.run(async (ctx) => {
      const schedule = await ctx.db
        .query("lessonSchedules")
        .withIndex("by_dayId_and_year", (q) => q.eq("dayId", countdown.dayId).eq("year", "2026-27"))
        .unique();
      if (lessonAt === null) await ctx.db.delete("lessonSchedules", schedule!._id);
      else await ctx.db.patch("lessonSchedules", schedule!._id, { lessonAt });
    });
  const jordan = await student("jsmith");
  const priya = await student("ppatel");
  return {
    t,
    admin: as(t, adminUserId),
    jordan,
    priya,
    jordanSession: as(t, jordan.userId),
    countdown,
    workspaceOf,
    setLessonDate,
  };
}

const submissionsOf = (t: ReturnType<typeof setupConvex>, workspaceId: Id<"workspaces">) =>
  t.run((ctx) =>
    ctx.db
      .query("submissions")
      .withIndex("by_workspaceId_and_attempt", (q) => q.eq("workspaceId", workspaceId))
      .take(50),
  );

describe("turn in", () => {
  test("a retry with the same key returns the same attempt", async () => {
    const { t, jordan, jordanSession, workspaceOf } = await setup();
    const workspace = await workspaceOf(jordan._id);

    const first = await jordanSession.mutation(api.submissions.turnIn, {
      workspaceId: workspace._id,
      idempotencyKey: "click-0001",
    });
    // The saved files equal v14, so the snapshot reuses it.
    expect(first).toMatchObject({ attempt: 1, versionNumber: 14, repeated: false });
    const retry = await jordanSession.mutation(api.submissions.turnIn, {
      workspaceId: workspace._id,
      idempotencyKey: "click-0001",
    });
    expect(retry).toEqual({ ...first, repeated: true });
    expect(await submissionsOf(t, workspace._id)).toHaveLength(1);

    // A new click is a new attempt.
    const second = await jordanSession.mutation(api.submissions.turnIn, {
      workspaceId: workspace._id,
      idempotencyKey: "click-0002",
    });
    expect(second.attempt).toBe(2);
    expect(await submissionsOf(t, workspace._id)).toHaveLength(2);
  });

  test("turn-in never closes, long after the lesson or with no lesson date", async () => {
    const { t, jordan, jordanSession, workspaceOf, setLessonDate } = await setup();
    const workspace = await workspaceOf(jordan._id);

    // A lesson months ago still takes a first attempt and later ones.
    await setLessonDate(Date.now() - 120 * 24 * 60 * 60_000);
    await jordanSession.mutation(api.submissions.turnIn, {
      workspaceId: workspace._id,
      idempotencyKey: "months-later",
    });
    await jordanSession.mutation(api.workspaces.saveFiles, {
      workspaceId: workspace._id,
      files: [{ name: "main.py", content: FIXED, baseRevision: 0 }],
    });
    const again = await jordanSession.mutation(api.submissions.turnIn, {
      workspaceId: workspace._id,
      idempotencyKey: "months-later-again",
    });
    expect(again).toMatchObject({ attempt: 2, repeated: false });
    const card = await jordanSession.query(api.submissions.forWorkspace, { workspaceId: workspace._id });
    expect(card).not.toHaveProperty("closesAt");
    expect(card.latest?.attempt).toBe(2);

    // Unscheduled days take turn-ins too.
    await setLessonDate(null);
    expect(
      (
        await jordanSession.mutation(api.submissions.turnIn, {
          workspaceId: workspace._id,
          idempotencyKey: "unscheduled",
        })
      ).attempt,
    ).toBe(3);
    expect(await submissionsOf(t, workspace._id)).toHaveLength(3);
  });

  test("a submitted snapshot doesn't change when the work is edited or restored", async () => {
    const { t, admin, jordan, jordanSession, countdown, workspaceOf } = await setup();
    const workspace = await workspaceOf(jordan._id);
    await jordanSession.mutation(api.workspaces.saveFiles, {
      workspaceId: workspace._id,
      files: [{ name: "main.py", content: FIXED, baseRevision: 0 }],
    });
    const card = await jordanSession.query(api.submissions.forWorkspace, { workspaceId: workspace._id });
    expect(card.nextVersion).toBe(15);
    const result = await jordanSession.mutation(api.submissions.turnIn, {
      workspaceId: workspace._id,
      idempotencyKey: "snapshot-1",
    });
    expect(result.versionNumber).toBe(15);
    const [submission] = await submissionsOf(t, workspace._id);
    const version = await t.run((ctx) => ctx.db.get("workVersions", submission!.versionId));
    expect(version).toMatchObject({ number: 15, reason: "submit", files: [{ name: "main.py", content: FIXED }] });
    // The fixed code was never checked, so review shows "not checked".
    expect(submission!.checkResultId).toBeUndefined();

    await jordanSession.mutation(api.workspaces.saveFiles, {
      workspaceId: workspace._id,
      files: [{ name: "main.py", content: "print('changed')\n", baseRevision: 1 }],
    });
    await jordanSession.mutation(api.workspaces.restore, { workspaceId: workspace._id, number: 14 });

    const after = await t.run((ctx) => ctx.db.get("workVersions", submission!.versionId));
    expect(after).toEqual(version);
    const review = await admin.query(api.review.attempt, { assignmentId: countdown._id, studentId: jordan._id });
    expect(review?.selected).toMatchObject({
      attempt: 1,
      versionNumber: 15,
      files: [{ name: "main.py", content: FIXED }],
      check: null,
    });
  });

  test("guided turn-ins carry the check of exactly the submitted files", async () => {
    const { t, admin, jordan, jordanSession, countdown, workspaceOf } = await setup();
    const workspace = await workspaceOf(jordan._id);
    const prep = await jordanSession.mutation(api.checks.prepare, { workspaceId: workspace._id });
    await jordanSession.mutation(api.checks.record, {
      workspaceId: workspace._id,
      versionId: prep.versionId,
      revisionId: prep.revisionId,
      output: "10\n8\n6\n4\n2\nLiftoff!\n",
      outputTruncated: false,
      runOutcome: "ok",
    });
    await jordanSession.mutation(api.submissions.turnIn, { workspaceId: workspace._id, idempotencyKey: "checked-1" });
    const review = await admin.query(api.review.attempt, { assignmentId: countdown._id, studentId: jordan._id });
    expect(review?.selected?.check).toMatchObject({
      outcome: "partial",
      output: "10\n8\n6\n4\n2\nLiftoff!\n",
      partialMin: 2,
    });
    expect(review?.selected?.expectedOutput).toContain("Liftoff!");
    const [submission] = await submissionsOf(t, workspace._id);
    expect(submission!.versionId).toBe(prep.versionId);
  });

  test("another student's work can't be turned in or read", async () => {
    const { priya, t, jordan, jordanSession, workspaceOf } = await setup();
    const workspace = await workspaceOf(jordan._id);
    const priyaSession = as(t, priya.userId);
    await expect(
      priyaSession.mutation(api.submissions.turnIn, { workspaceId: workspace._id, idempotencyKey: "not-mine-1" }),
    ).rejects.toThrow(/not found/);
    await expect(
      priyaSession.query(api.submissions.forWorkspace, { workspaceId: workspace._id }),
    ).rejects.toThrow(/not found/);

    // Reusing someone else's key reveals nothing and creates nothing.
    const priyaWorkspace = await workspaceOf(priya._id);
    const [priyaFirst] = await submissionsOf(t, priyaWorkspace._id);
    await expect(
      jordanSession.mutation(api.submissions.turnIn, {
        workspaceId: workspace._id,
        idempotencyKey: priyaFirst!.idempotencyKey,
      }),
    ).rejects.toThrow(/Something went wrong/);
    expect(await submissionsOf(t, workspace._id)).toHaveLength(0);
    expect(await submissionsOf(t, priyaWorkspace._id)).toHaveLength(2);
  });
});

describe("review", () => {
  test("turning in again before review replaces the waiting attempt", async () => {
    const { t, admin, jordan, jordanSession, countdown, workspaceOf } = await setup();
    const before = await admin.query(api.adminNav.badges, {});
    const workspace = await workspaceOf(jordan._id);
    await jordanSession.mutation(api.submissions.turnIn, { workspaceId: workspace._id, idempotencyKey: "first-try" });
    expect((await admin.query(api.adminNav.badges, {})).unreviewed).toBe(before.unreviewed + 1);

    await jordanSession.mutation(api.workspaces.saveFiles, {
      workspaceId: workspace._id,
      files: [{ name: "main.py", content: FIXED, baseRevision: 0 }],
    });
    await jordanSession.mutation(api.submissions.turnIn, { workspaceId: workspace._id, idempotencyKey: "second-try" });

    const attempts = await submissionsOf(t, workspace._id);
    expect(attempts.map((s) => [s.attempt, s.status])).toEqual([
      [1, "superseded"],
      [2, "unreviewed"],
    ]);
    // Still one waiting attempt for Jordan.
    expect((await admin.query(api.adminNav.badges, {})).unreviewed).toBe(before.unreviewed + 1);
    const queue = await admin.query(api.review.queue, { assignmentId: countdown._id });
    expect(queue?.rows.find((r) => r.studentId === jordan._id)).toMatchObject({ state: "unreviewed", attempt: 2 });

    // The earlier attempt stays visible but can't be reviewed.
    const review = await admin.query(api.review.attempt, {
      assignmentId: countdown._id,
      studentId: jordan._id,
      attempt: 1,
    });
    expect(review?.attempts.map((a) => a.status)).toEqual(["superseded", "unreviewed"]);
    expect(review?.selected).toMatchObject({ attempt: 1, latest: false, status: "superseded" });
    await expect(
      admin.mutation(api.review.markReviewed, { submissionId: review!.selected!._id, feedback: "", privateNote: "" }),
    ).rejects.toThrow(/newer attempt/);
  });

  test("the queue shows every student's latest state", async () => {
    const { admin, countdown, priya, jordan } = await setup();
    const queue = (await admin.query(api.review.queue, { assignmentId: countdown._id }))!;
    expect(queue.waiting).toBe(5);
    expect(queue.rows.slice(0, 7).map((r) => [r.name, r.state])).toEqual([
      ["Priya Patel", "newAttempt"],
      ["Noah Kim", "unreviewed"],
      ["Ava Chen", "unreviewed"],
      ["Maya Singh", "unreviewed"],
      ["Isla Moore", "unreviewed"],
      ["Owen Clark", "reviewed"],
      expect.arrayContaining(["notTurnedIn"]),
    ]);
    expect(queue.rows.find((r) => r.studentId === priya._id)).toMatchObject({ attempt: 2, outcome: "partial" });
    expect(queue.rows.find((r) => r.studentId === jordan._id)).toMatchObject({
      state: "notTurnedIn",
      attempt: null,
    });
    const options = await admin.query(api.review.options, { group: "basic" });
    const day = options.days.find((d) => d._id === countdown.dayId);
    expect(day?.assignments.find((a) => a._id === countdown._id)?.waiting).toBe(5);
  });

  test("feedback reaches the student; the private note never does", async () => {
    const { t, admin, priya, countdown, workspaceOf } = await setup();
    const priyaSession = as(t, priya.userId);
    const review = (await admin.query(api.review.attempt, { assignmentId: countdown._id, studentId: priya._id }))!;
    expect(review.selected).toMatchObject({ attempt: 2, latest: true, status: "unreviewed", feedback: null });

    await admin.mutation(api.review.markReviewed, {
      submissionId: review.selected!._id,
      feedback: "  Close! Check the last line against the task.  ",
      privateNote: "Talked about string punctuation in class.",
    });

    const workspace = await workspaceOf(priya._id);
    const card = await priyaSession.query(api.submissions.forWorkspace, { workspaceId: workspace._id });
    expect(card.latest).toMatchObject({ attempt: 2, status: "reviewed", reviewerName: "Max" });
    expect(card.feedback).toMatchObject({ attempt: 2, body: "Close! Check the last line against the task." });
    const home = await priyaSession.query(api.student.home, {});
    expect(home.latestFeedback?.body).toBe("Close! Check the last line against the task.");
    for (const seen of [card, home]) expect(JSON.stringify(seen)).not.toContain("punctuation");

    // Admins see both, and the attempt left the queue.
    const after = (await admin.query(api.review.attempt, { assignmentId: countdown._id, studentId: priya._id }))!;
    expect(after.selected).toMatchObject({
      status: "reviewed",
      reviewerName: "Max",
      privateNote: "Talked about string punctuation in class.",
    });
    const queue = (await admin.query(api.review.queue, { assignmentId: countdown._id }))!;
    expect(queue.waiting).toBe(4);
    expect(queue.rows.find((r) => r.studentId === priya._id)?.state).toBe("reviewed");

    // Editing keeps the review time; clearing feedback removes it.
    await admin.mutation(api.review.markReviewed, {
      submissionId: review.selected!._id,
      feedback: "",
      privateNote: "Talked about string punctuation in class.",
    });
    const edited = (await admin.query(api.review.attempt, { assignmentId: countdown._id, studentId: priya._id }))!;
    expect(edited.selected).toMatchObject({ feedback: null, reviewedAt: after.selected!.reviewedAt });
    expect((await priyaSession.query(api.submissions.forWorkspace, { workspaceId: workspace._id })).feedback).toBeNull();

    // History records the review without the writing itself.
    const history = await admin.query(api.adminHistory.list, { paginationOpts: { numItems: 5, cursor: null } });
    expect(history.page[0]?.summary).toMatch(/Updated the review of Priya Patel’s Countdown, attempt 2/);
    expect(JSON.stringify(history.page)).not.toContain("punctuation");
  });

  test("review is admin-only", async () => {
    const { t, priya, jordanSession, countdown } = await setup();
    const submission = (await t.run((ctx) =>
      ctx.db
        .query("submissions")
        .withIndex("by_assignmentId_and_status", (q) => q.eq("assignmentId", countdown._id).eq("status", "unreviewed"))
        .first(),
    ))!;
    const refuses = async (caller: ReturnType<typeof as>, refusal: RegExp) => {
      await expect(caller.query(api.review.options, { group: "basic" })).rejects.toThrow(refusal);
      await expect(caller.query(api.review.queue, { assignmentId: countdown._id })).rejects.toThrow(refusal);
      await expect(
        caller.query(api.review.attempt, { assignmentId: countdown._id, studentId: priya._id }),
      ).rejects.toThrow(refusal);
      await expect(
        caller.mutation(api.review.markReviewed, { submissionId: submission._id, feedback: "", privateNote: "" }),
      ).rejects.toThrow(refusal);
    };
    await refuses(jordanSession, /Only admins/);
    await refuses(t, /Sign in/);
    expect((await t.run((ctx) => ctx.db.get("submissions", submission._id)))?.status).toBe("unreviewed");
  });
});

test("review decisions and comments reach the student and reset on a new attempt", async () => {
  const { admin, jordanSession, jordan, workspaceOf, countdown } = await setup();
  const workspace = await workspaceOf(jordan._id);
  const submitted = await jordanSession.mutation(api.submissions.turnIn, { workspaceId: workspace._id, idempotencyKey: "review-decisions" });
  const detail = await admin.query(api.review.attempt, { assignmentId: countdown._id, studentId: jordan._id, attempt: submitted.attempt });
  const submissionId = detail!.selected!._id;
  await expect(jordanSession.mutation(api.review.markReviewed, { submissionId, reviewDecision: "complete", feedback: "", privateNote: "" })).rejects.toThrow();
  await admin.mutation(api.review.markReviewed, { submissionId, reviewDecision: "needsWork", feedback: "Please fix the loop", privateNote: "Teacher only" });
  const returned = await jordanSession.query(api.submissions.forWorkspace, { workspaceId: workspace._id });
  expect(returned.latest?.reviewDecision).toBe("needsWork");
  expect(returned.feedback?.body).toBe("Please fix the loop");
  const list = await jordanSession.query(api.myWork.list, { paginationOpts: { numItems: 20, cursor: null } });
  expect(list.page.find(w => w._id === workspace._id)?.latestAttempt?.reviewDecision).toBe("needsWork");
  const history = await jordanSession.query(api.myWork.attempts, { workspaceId: workspace._id, paginationOpts: { numItems: 10, cursor: null } });
  expect(history.page[0].feedback.map(f => f.body)).toEqual(["Please fix the loop"]);
  await admin.mutation(api.review.markReviewed, { submissionId, reviewDecision: "complete", feedback: "Looks good", privateNote: "Teacher only" });
  expect((await jordanSession.query(api.submissions.forWorkspace, { workspaceId: workspace._id })).latest?.reviewDecision).toBe("complete");
  await jordanSession.mutation(api.submissions.turnIn, { workspaceId: workspace._id, idempotencyKey: "review-decisions-again" });
  const again = await jordanSession.query(api.submissions.forWorkspace, { workspaceId: workspace._id });
  expect(again.latest?.attempt).toBe(submitted.attempt + 1);
  expect(again.latest?.status).toBe("unreviewed");
  expect(again.latest?.reviewDecision).toBeUndefined();
});
