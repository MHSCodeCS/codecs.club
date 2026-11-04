import { writableClass } from "./lib/classes";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { adminFirstName } from "./lib/adminNames";
import { appError } from "./lib/errors";
import { sameFiles } from "./lib/workFiles";
import { submissionStatusValidator, reviewDecisionValidator } from "./schema";
import { latestVersion, requireOwnWorkspace, snapshot, workingFiles } from "./workspaces";

/**
 * Turn in: the student sends their saved working copy as a preserved
 * snapshot (a version) for review. The browser saves first; Convex then pins
 * exactly what is saved. Retries with the same idempotency key return the
 * attempt they already made. Turning in again before review adds an attempt
 * and takes the earlier one out of the review queue (D09). Turn-in never
 * closes: there is no due date or cutoff (D05 superseded).
 */

/** Earlier attempts read when looking for the latest student-visible feedback. */
const MAX_ATTEMPTS_READ = 20;
/** Rows per submission are one feedback and one private note; read a few spare. */
const MAX_FEEDBACK_ROWS = 10;

export async function scheduleFor(
  ctx: Pick<QueryCtx, "db">,
  dayId: Id<"days">,
  year: string,
): Promise<Doc<"lessonSchedules"> | null> {
  return await ctx.db
    .query("lessonSchedules")
    .withIndex("by_dayId_and_year", (q) => q.eq("dayId", dayId).eq("year", year))
    .unique();
}

export async function feedbackRows(
  ctx: Pick<QueryCtx, "db">,
  submissionId: Id<"submissions">,
): Promise<Doc<"feedback">[]> {
  return await ctx.db
    .query("feedback")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
    .take(MAX_FEEDBACK_ROWS);
}

/**
 * Snapshots the saved working copy and records it as the next attempt. Call
 * only after autosave has flushed, so the snapshot is what the student sees.
 */
export const turnIn = mutation({
  args: { workspaceId: v.id("workspaces"), idempotencyKey: v.string() },
  returns: v.object({
    attempt: v.number(),
    versionNumber: v.number(),
    submittedAt: v.number(),
    /** True when this key had already turned in; nothing new was created. */
    repeated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireOwnWorkspace(ctx, args.workspaceId);
    await writableClass(ctx, workspace.group);
    const key = args.idempotencyKey;
    if (key.length < 8 || key.length > 100) {
      throw appError("INVALID", "Something went wrong. Reload the page and try again.");
    }

    // A retry returns the attempt it already made.
    const existing = await ctx.db
      .query("submissions")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", key))
      .unique();
    if (existing !== null) {
      if (existing.workspaceId !== workspace._id) {
        throw appError("CONFLICT", "Something went wrong. Reload the page and try again.");
      }
      const version = await ctx.db.get("workVersions", existing.versionId);
      return {
        attempt: existing.attempt,
        versionNumber: version?.number ?? 0,
        submittedAt: existing.submittedAt,
        repeated: true,
      };
    }

    const assignment = await ctx.db.get("assignments", workspace.assignmentId);
    if (assignment === null) throw appError("NOT_FOUND", "This assignment isn’t available.");
    const now = Date.now();

    const files = snapshot(await workingFiles(ctx, workspace._id));
    if (files.length === 0) throw appError("INVALID", "There are no files to turn in.");
    const latest = await latestVersion(ctx, workspace._id);
    let versionId: Id<"workVersions">;
    let versionNumber: number;
    if (latest !== null && sameFiles(latest.files, files)) {
      versionId = latest._id;
      versionNumber = latest.number;
    } else {
      versionNumber = Math.max(workspace.latestVersion, latest?.number ?? 0) + 1;
      versionId = await ctx.db.insert("workVersions", {
        workspaceId: workspace._id,
        number: versionNumber,
        files,
        createdBy: userId,
        createdAt: now,
        reason: "submit",
      });
      await ctx.db.patch("workspaces", workspace._id, { latestVersion: versionNumber });
    }

    // Only the latest attempt is ever waiting for review.
    const previous = await ctx.db
      .query("submissions")
      .withIndex("by_workspaceId_and_attempt", (q) => q.eq("workspaceId", workspace._id))
      .order("desc")
      .first();
    if (previous?.status === "unreviewed") {
      await ctx.db.patch("submissions", previous._id, { status: "superseded" });
    }

    // Guided work carries the check of exactly these files, if there is one.
    const check =
      assignment.type === "guided"
        ? await ctx.db
            .query("checkResults")
            .withIndex("by_versionId", (q) => q.eq("versionId", versionId))
            .order("desc")
            .first()
        : null;

    const attempt = (previous?.attempt ?? 0) + 1;
    await ctx.db.insert("submissions", {
      workspaceId: workspace._id,
      studentId: workspace.studentId,
      assignmentId: workspace.assignmentId,
      attempt,
      versionId,
      submittedAt: now,
      checkResultId: check?._id,
      status: "unreviewed",
      idempotencyKey: key,
    });
    return { attempt, versionNumber, submittedAt: now, repeated: false };
  },
});

/**
 * The turn-in card: which version Turn in would send, the latest attempt and
 * its review, and the latest student-visible feedback. Admin names are first
 * names. Private notes are never read here.
 */
export const forWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    /** The version a turn-in would send now (the latest, or the next one if files changed). */
    nextVersion: v.number(),
    latest: v.union(
      v.null(),
      v.object({
        attempt: v.number(),
        submittedAt: v.number(),
        versionNumber: v.number(),
        status: submissionStatusValidator, reviewDecision: v.optional(reviewDecisionValidator),
        reviewedAt: v.union(v.number(), v.null()),
        reviewerName: v.union(v.string(), v.null()),
      }),
    ),
    feedback: v.union(
      v.null(),
      v.object({
        attempt: v.number(),
        body: v.string(),
        authorName: v.string(),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { workspace } = await requireOwnWorkspace(ctx, args.workspaceId);
    const version = await latestVersion(ctx, workspace._id);
    const files = await workingFiles(ctx, workspace._id);
    const versionCount = Math.max(workspace.latestVersion, version?.number ?? 0);
    const nextVersion =
      version !== null && sameFiles(version.files, files) ? version.number : versionCount + 1;

    const attempts = await ctx.db
      .query("submissions")
      .withIndex("by_workspaceId_and_attempt", (q) => q.eq("workspaceId", workspace._id))
      .order("desc")
      .take(MAX_ATTEMPTS_READ);
    const newest = attempts[0];
    let latest = null;
    if (newest !== undefined) {
      const submitted = await ctx.db.get("workVersions", newest.versionId);
      latest = {
        attempt: newest.attempt,
        submittedAt: newest.submittedAt,
        versionNumber: submitted?.number ?? 0,
        status: newest.status, reviewDecision: newest.reviewDecision,
        reviewedAt: newest.reviewedAt ?? null,
        reviewerName: newest.reviewedBy ? await adminFirstName(ctx, newest.reviewedBy) : null,
      };
    }

    let feedback = null;
    for (const submission of attempts) {
      const written = (await feedbackRows(ctx, submission._id)).find(
        (row) => row.visibility === "student",
      );
      if (written === undefined) continue;
      feedback = {
        attempt: submission.attempt,
        body: written.body,
        authorName: await adminFirstName(ctx, written.authorId),
        createdAt: written.createdAt,
      };
      break;
    }

    return { nextVersion, latest, feedback };
  },
});
