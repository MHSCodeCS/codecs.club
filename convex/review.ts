import { classYear, writableClass } from "./lib/classes";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getSettings, requireAdmin } from "./lib/access";
import { adminName } from "./lib/adminNames";
import { recordAdminChange } from "./lib/changes";
import { appError } from "./lib/errors";
import {
  assignmentTypeValidator,
  checkRunOutcomeValidator,
  fileValidator,
  groupValidator,
  outcomeValidator,
  partKindValidator,
  submissionStatusValidator, reviewDecisionValidator,
} from "./schema";
import { feedbackRows, scheduleFor } from "./submissions";

/**
 * Admin Review: per assignment, every student's latest attempt, the submitted
 * snapshot with its check and expected output, and the admin's optional
 * student-visible feedback and private note (D07). Only the latest attempt is
 * reviewed; earlier unreviewed attempts were superseded when the student
 * turned in again (D09).
 */

const MAX_DAYS = 100;
const MAX_ASSIGNMENTS_PER_DAY = 50;
const MAX_STUDENTS = 300;
const MAX_ATTEMPTS = 50;
/** Waiting counts are capped like the sidebar badge. */
const WAITING_CAP = 100;
export const MAX_FEEDBACK_CHARS = 4000;

const queueStateValidator = v.union(
  v.literal("newAttempt"),
  v.literal("unreviewed"),
  v.literal("reviewed"),
  v.literal("notTurnedIn"),
);
type QueueState = typeof queueStateValidator.type;

/** The curriculum Review shows for a group: the most recently created one, as on Curriculum. */
async function groupCurriculum(ctx: Pick<QueryCtx, "db">, group: Doc<"students">["group"]) {
  return await ctx.db
    .query("curricula")
    .withIndex("by_group", (q) => q.eq("group", group))
    .order("desc")
    .first();
}

async function waitingCount(ctx: Pick<QueryCtx, "db">, assignmentId: Id<"assignments">) {
  const waiting = await ctx.db
    .query("submissions")
    .withIndex("by_assignmentId_and_status", (q) =>
      q.eq("assignmentId", assignmentId).eq("status", "unreviewed"),
    )
    .take(WAITING_CAP);
  return waiting.length;
}

const studentName = (s: Doc<"students">) => `${s.firstName} ${s.lastName}`;

/** Days and assignments of the group's curriculum, with how many attempts wait on each. */
export const options = query({
  args: { group: groupValidator },
  returns: v.object({
    timeZone: v.string(),
    curriculum: v.union(v.null(), v.object({ _id: v.id("curricula"), name: v.string() })),
    days: v.array(
      v.object({
        _id: v.id("days"),
        order: v.number(),
        topic: v.string(),
        lessonAt: v.union(v.number(), v.null()),
        assignments: v.array(
          v.object({
            _id: v.id("assignments"),
            title: v.string(),
            type: assignmentTypeValidator,
            waiting: v.number(),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const settings = await getSettings(ctx);
    const curriculum = await groupCurriculum(ctx, args.group);
    const days = [];
    if (curriculum !== null) {
      const dayDocs = await ctx.db
        .query("days")
        .withIndex("by_curriculumId_and_order", (q) => q.eq("curriculumId", curriculum._id))
        .take(MAX_DAYS);
      for (const day of dayDocs) {
        const schedule = await scheduleFor(ctx, day._id, await classYear(ctx, args.group));
        const assignmentDocs = await ctx.db
          .query("assignments")
          .withIndex("by_dayId_and_order", (q) => q.eq("dayId", day._id))
          .take(MAX_ASSIGNMENTS_PER_DAY);
        const assignments = [];
        for (const a of assignmentDocs) {
          const waiting = await waitingCount(ctx, a._id);
          // Drafts never reach students, so they have nothing to review.
          if (a.status !== "published" && waiting === 0) continue;
          assignments.push({ _id: a._id, title: a.title, type: a.type, waiting });
        }
        days.push({
          _id: day._id,
          order: day.order,
          topic: day.topic,
          lessonAt: schedule?.lessonAt ?? null,
          assignments,
        });
      }
    }
    return {
      timeZone: settings.timeZone,
      curriculum: curriculum && { _id: curriculum._id, name: curriculum.name },
      days,
    };
  },
});

/**
 * One row per student for an assignment: everyone in its curriculum plus
 * anyone else with work on it (e.g. moved to another group since). Waiting
 * attempts come first, newest first; then reviewed; then not turned in.
 */
export const queue = query({
  args: { assignmentId: v.id("assignments") },
  returns: v.union(
    v.null(),
    v.object({
      assignment: v.object({
        _id: v.id("assignments"),
        title: v.string(),
        type: assignmentTypeValidator,
      }),
      day: v.object({ _id: v.id("days"), order: v.number(), topic: v.string() }),
      waiting: v.number(),
      rows: v.array(
        v.object({
          studentId: v.id("students"),
          name: v.string(),
          loginCode: v.string(),
          state: queueStateValidator,
          reviewDecision: v.union(reviewDecisionValidator, v.null()),
          attempt: v.union(v.number(), v.null()),
          submittedAt: v.union(v.number(), v.null()),
          outcome: v.union(outcomeValidator, v.null()),
          /** Last save of the live working copy, if the student opened it. */
          savedAt: v.union(v.number(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const assignment = await ctx.db.get("assignments", args.assignmentId);
    if (assignment === null) return null;
    const day = await ctx.db.get("days", assignment.dayId);
    if (day === null) return null;

    const workspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignment._id))
      .take(MAX_STUDENTS);
    const workspaceByStudent = new Map(workspaces.map((w) => [w.studentId, w]));
    const students = new Map<Id<"students">, Doc<"students">>();
    for (const s of await ctx.db
      .query("students")
      .withIndex("by_curriculumId", (q) => q.eq("curriculumId", day.curriculumId))
      .take(MAX_STUDENTS)) {
      students.set(s._id, s);
    }
    for (const w of workspaces) {
      if (students.has(w.studentId)) continue;
      const s = await ctx.db.get("students", w.studentId);
      if (s !== null) students.set(s._id, s);
    }

    const rank: Record<QueueState, number> = { newAttempt: 0, unreviewed: 0, reviewed: 1, notTurnedIn: 2 };
    const rows = [];
    for (const student of students.values()) {
      const workspace = workspaceByStudent.get(student._id) ?? null;
      let state: QueueState = "notTurnedIn";
      let latest: Doc<"submissions"> | null = null;
      if (workspace !== null) {
        // Newest first; stop at the first earlier attempt that was reviewed.
        let earlierReviewed = false;
        let read = 0;
        for await (const s of ctx.db
          .query("submissions")
          .withIndex("by_workspaceId_and_attempt", (q) => q.eq("workspaceId", workspace._id))
          .order("desc")) {
          if (latest === null) latest = s;
          else if (s.status === "reviewed") {
            earlierReviewed = true;
            break;
          }
          if (++read >= MAX_ATTEMPTS || latest.status !== "unreviewed") break;
        }
        if (latest !== null) {
          state =
            latest.status === "reviewed"
              ? "reviewed"
              : earlierReviewed
                ? "newAttempt"
                : "unreviewed";
        }
      }
      const check = latest?.checkResultId ? await ctx.db.get("checkResults", latest.checkResultId) : null;
      rows.push({
        studentId: student._id,
        name: studentName(student),
        loginCode: student.loginCode,
        state,
        reviewDecision: latest?.reviewDecision ?? null,
        attempt: latest?.attempt ?? null,
        submittedAt: latest?.submittedAt ?? null,
        outcome: check?.outcome ?? null,
        savedAt: workspace?.updatedAt ?? null,
      });
    }
    const lastName = (id: Id<"students">) => students.get(id)?.lastName ?? "";
    rows.sort(
      (a, b) =>
        rank[a.state] - rank[b.state] ||
        (b.submittedAt ?? 0) - (a.submittedAt ?? 0) ||
        lastName(a.studentId).localeCompare(lastName(b.studentId)) ||
        a.name.localeCompare(b.name),
    );

    return {
      assignment: { _id: assignment._id, title: assignment.title, type: assignment.type },
      day: { _id: day._id, order: day.order, topic: day.topic },
      waiting: rows.filter((r) => r.state === "newAttempt" || r.state === "unreviewed").length,
      rows,
    };
  },
});

const partResultValidator = v.object({
  name: v.string(),
  met: v.boolean(),
  detail: v.optional(v.string()),
});

/**
 * One student's attempts on an assignment and the selected attempt (the
 * latest unless `attempt` is given) with its snapshot, check, expected output,
 * feedback and private note.
 */
export const attempt = query({
  args: {
    assignmentId: v.id("assignments"),
    studentId: v.id("students"),
    attempt: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      timeZone: v.string(),
      workspaceId: v.union(v.id("workspaces"), v.null()),
      student: v.object({
        _id: v.id("students"),
        name: v.string(),
        firstName: v.string(),
        loginCode: v.string(),
      }),
      savedAt: v.union(v.number(), v.null()),
      attempts: v.array(
        v.object({
          attempt: v.number(),
          submittedAt: v.number(),
          status: submissionStatusValidator, reviewDecision: v.optional(reviewDecisionValidator),
          reviewedAt: v.union(v.number(), v.null()),
          hasFeedback: v.boolean(),
          hasNote: v.boolean(),
        }),
      ),
      selected: v.union(
        v.null(),
        v.object({
          _id: v.id("submissions"),
          attempt: v.number(),
          latest: v.boolean(),
          status: submissionStatusValidator, reviewDecision: v.optional(reviewDecisionValidator),
          submittedAt: v.number(),
          reviewedAt: v.union(v.number(), v.null()),
          reviewerName: v.union(v.string(), v.null()),
          versionNumber: v.number(),
          files: v.array(fileValidator),
          expectedOutput: v.union(v.string(), v.null()),
          expectedParts: v.array(
            v.object({ name: v.string(), kind: partKindValidator, expected: v.string() }),
          ),
          check: v.union(
            v.null(),
            v.object({
              outcome: outcomeValidator,
              parts: v.array(partResultValidator),
              partialMin: v.number(),
              runOutcome: v.union(checkRunOutcomeValidator, v.null()),
              output: v.union(v.string(), v.null()),
              outputTruncated: v.boolean(),
              ranAt: v.number(),
            }),
          ),
          feedback: v.union(v.string(), v.null()),
          privateNote: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const settings = await getSettings(ctx);
    const student = await ctx.db.get("students", args.studentId);
    const assignment = await ctx.db.get("assignments", args.assignmentId);
    if (student === null || assignment === null) return null;
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_studentId_and_assignmentId", (q) =>
        q.eq("studentId", student._id).eq("assignmentId", assignment._id),
      )
      .unique();
    const submissions = workspace
      ? await ctx.db
          .query("submissions")
          .withIndex("by_workspaceId_and_attempt", (q) => q.eq("workspaceId", workspace._id))
          .order("desc")
          .take(MAX_ATTEMPTS)
      : [];
    const attempts = [];
    const writing = new Map<Id<"submissions">, Doc<"feedback">[]>();
    for (const s of submissions.toReversed()) {
      const rows = await feedbackRows(ctx, s._id);
      writing.set(s._id, rows);
      attempts.push({
        attempt: s.attempt,
        submittedAt: s.submittedAt,
        status: s.status, reviewDecision: s.reviewDecision,
        reviewedAt: s.reviewedAt ?? null,
        hasFeedback: rows.some((r) => r.visibility === "student"),
        hasNote: rows.some((r) => r.visibility === "private"),
      });
    }

    const chosen =
      args.attempt === undefined
        ? submissions[0]
        : submissions.find((s) => s.attempt === args.attempt);
    let selected = null;
    if (chosen !== undefined) {
      const version = await ctx.db.get("workVersions", chosen.versionId);
      const check = chosen.checkResultId
        ? await ctx.db.get("checkResults", chosen.checkResultId)
        : null;
      // Expected output comes from the rules the check used, else the published task.
      const revisionId = check?.revisionId ?? assignment.publishedRevisionId;
      const revision = revisionId ? await ctx.db.get("assignmentRevisions", revisionId) : null;
      const rows = writing.get(chosen._id) ?? [];
      selected = {
        _id: chosen._id,
        attempt: chosen.attempt,
        latest: chosen._id === submissions[0]?._id,
        status: chosen.status, reviewDecision: chosen.reviewDecision,
        submittedAt: chosen.submittedAt,
        reviewedAt: chosen.reviewedAt ?? null,
        reviewerName: chosen.reviewedBy ? await adminName(ctx, chosen.reviewedBy) : null,
        versionNumber: version?.number ?? 0,
        files: version?.files ?? [],
        expectedOutput: revision?.expectedOutput ?? null,
        expectedParts: revision?.parts ?? [],
        check: check && {
          outcome: check.outcome,
          parts: check.parts,
          partialMin: revision?.partialMin ?? 0,
          runOutcome: check.runOutcome ?? null,
          output: check.output ?? null,
          outputTruncated: check.outputTruncated ?? false,
          ranAt: check.ranAt,
        },
        feedback: rows.find((r) => r.visibility === "student")?.body ?? null,
        privateNote: rows.find((r) => r.visibility === "private")?.body ?? null,
      };
    }

    return {
      timeZone: settings.timeZone,
      workspaceId: workspace?._id ?? null,
      student: {
        _id: student._id,
        name: studentName(student),
        firstName: student.firstName,
        loginCode: student.loginCode,
      },
      savedAt: workspace?.updatedAt ?? null,
      attempts,
      selected,
    };
  },
});

/**
 * Marks the latest attempt reviewed and saves the optional student-visible
 * feedback and private note (empty text removes one). On an attempt that is
 * already reviewed, it updates the writing and keeps the original review time.
 */
export const markReviewed = mutation({
  args: {
    submissionId: v.id("submissions"),
    feedback: v.string(),
    privateNote: v.string(),
    reviewDecision: v.optional(reviewDecisionValidator),
  },
  returns: v.object({ reviewedAt: v.number() }),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const submission = await ctx.db.get("submissions", args.submissionId);
    if (submission === null) throw appError("NOT_FOUND", "That attempt wasn’t found.");
    const workspace = await ctx.db.get("workspaces", submission.workspaceId);
    if (workspace) await writableClass(ctx, workspace.group);
    const newest = await ctx.db
      .query("submissions")
      .withIndex("by_workspaceId_and_attempt", (q) => q.eq("workspaceId", submission.workspaceId))
      .order("desc")
      .first();
    if (submission.status === "superseded" || newest?._id !== submission._id) {
      throw appError("CONFLICT", "A newer attempt was turned in. Review that one instead.");
    }
    const text = { student: args.feedback.trim(), private: args.privateNote.trim() } as const;
    if (text.student.length > MAX_FEEDBACK_CHARS || text.private.length > MAX_FEEDBACK_CHARS) {
      throw appError("INVALID", `Keep feedback and notes under ${MAX_FEEDBACK_CHARS} characters.`);
    }

    const now = Date.now();
    const existing = await feedbackRows(ctx, submission._id);
    let changed = false;
    for (const visibility of ["student", "private"] as const) {
      const body = text[visibility];
      const row = existing.find((r) => r.visibility === visibility);
      if (row === undefined) {
        if (body.length === 0) continue;
        await ctx.db.insert("feedback", {
          submissionId: submission._id,
          studentId: submission.studentId,
          authorId: userId,
          body,
          visibility,
          createdAt: now,
        });
        changed = true;
      } else if (body.length === 0) {
        await ctx.db.delete("feedback", row._id);
        changed = true;
      } else if (row.body !== body) {
        await ctx.db.patch("feedback", row._id, { body, authorId: userId });
        changed = true;
      }
    }

    const reviewDecision = args.reviewDecision ?? submission.reviewDecision ?? "complete";
    const decisionChanged = reviewDecision !== submission.reviewDecision;
    const wasReviewed = submission.status === "reviewed";
    const reviewedAt = submission.reviewedAt ?? now;
    if (!wasReviewed || decisionChanged) {
      await ctx.db.patch("submissions", submission._id, {
        status: "reviewed",
        reviewDecision,
        reviewedBy: userId,
        reviewedAt,
      });
    }
    if (!wasReviewed || changed || decisionChanged) {
      const student = await ctx.db.get("students", submission.studentId);
      const assignment = await ctx.db.get("assignments", submission.assignmentId);
      const who = student ? studentName(student) : "a student";
      const what = `${assignment?.title ?? "an assignment"}, attempt ${submission.attempt}`;
      await recordAdminChange(ctx, {
        actorId: userId,
        table: "submissions",
        recordId: submission._id,
        summary: wasReviewed ? `Updated the review of ${who}’s ${what}` : `Reviewed ${who}’s ${what}`,
        before: { status: submission.status, reviewDecision: submission.reviewDecision ?? null },
        // Whether writing exists, never its text.
        after: {
          status: "reviewed",
          reviewDecision,
          feedback: text.student.length > 0,
          privateNote: text.private.length > 0,
        },
      });
    }
    return { reviewedAt };
  },
});
