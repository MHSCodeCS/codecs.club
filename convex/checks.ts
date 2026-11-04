import { writableClass } from "./lib/classes";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { appError } from "./lib/errors";
import { evaluate } from "./lib/evaluation";
import { sameFiles } from "./lib/workFiles";
import { checkRunOutcomeValidator, fileValidator, outcomeValidator } from "./schema";
import { latestVersion, requireOwnWorkspace, snapshot, workingFiles } from "./workspaces";

/**
 * Guided checks. The program runs in the student's browser; Convex pins the
 * exact files checked (a version) and evaluates the printed output against
 * the assignment's published parts, so every result names the code version
 * and the evaluation rules it used. No anti-cheating is attempted: output
 * matching is the agreed rule.
 */

/** Most printed output accepted for evaluation; matches the workspace limit. */
const MAX_OUTPUT_CHARS = 200_000;
/** Output kept on the result for review; the rest is dropped. */
const STORED_OUTPUT_CHARS = 20_000;

const partResultValidator = v.object({
  name: v.string(),
  met: v.boolean(),
  detail: v.optional(v.string()),
});

/** The published revision of a guided assignment, or an explanation why not. */
async function guidedRevision(
  ctx: Pick<QueryCtx, "db">,
  workspace: Doc<"workspaces">,
): Promise<Doc<"assignmentRevisions">> {
  const assignment = await ctx.db.get("assignments", workspace.assignmentId);
  if (assignment === null || assignment.status !== "published" || !assignment.publishedRevisionId) {
    throw appError("NOT_FOUND", "This assignment isn’t available.");
  }
  if (assignment.type !== "guided") {
    throw appError("INVALID", "Open-ended work has no automatic check.");
  }
  const revision = await ctx.db.get("assignmentRevisions", assignment.publishedRevisionId);
  if (revision === null || revision.parts.length === 0) {
    throw appError("INVALID", "This assignment has no checks yet.");
  }
  return revision;
}

/**
 * Pins the saved working copy as a version (reusing the latest version when
 * the files haven't changed) and returns what the browser needs to run the
 * check. Call after autosave has flushed.
 */
export const prepare = mutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    versionId: v.id("workVersions"),
    versionNumber: v.number(),
    revisionId: v.id("assignmentRevisions"),
    files: v.array(fileValidator),
    observeLoops: v.boolean(),
    inputs: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireOwnWorkspace(ctx, args.workspaceId);
    await writableClass(ctx, workspace.group);
    const revision = await guidedRevision(ctx, workspace);
    const files = snapshot(await workingFiles(ctx, workspace._id));
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
        createdAt: Date.now(),
        reason: "check",
      });
      await ctx.db.patch("workspaces", workspace._id, { latestVersion: versionNumber });
    }

    const input = revision.checkInput ?? "";
    return {
      versionId,
      versionNumber,
      revisionId: revision._id,
      files,
      observeLoops: revision.loopCheck,
      inputs: input.length === 0 ? [] : input.replace(/\r\n/g, "\n").split("\n"),
    };
  },
});

/** Evaluates the printed output of a check run and stores the result. */
export const record = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    versionId: v.id("workVersions"),
    revisionId: v.id("assignmentRevisions"),
    output: v.string(),
    outputTruncated: v.boolean(),
    runOutcome: checkRunOutcomeValidator,
  },
  returns: v.object({
    checkId: v.id("checkResults"),
    outcome: outcomeValidator,
    parts: v.array(partResultValidator),
  }),
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireOwnWorkspace(ctx, args.workspaceId);
    await writableClass(ctx, workspace.group);
    const version = await ctx.db.get("workVersions", args.versionId);
    if (version === null || version.workspaceId !== workspace._id) {
      throw appError("NOT_FOUND", "That version of your work wasn’t found.");
    }
    const revision = await guidedRevision(ctx, workspace);
    if (revision._id !== args.revisionId) {
      throw appError("CONFLICT", "The task changed while checking. Run the check again.");
    }
    if (args.output.length > MAX_OUTPUT_CHARS) {
      throw appError("INVALID", "Too much output to check.");
    }

    const result = evaluate(revision.parts, revision.partialMin, args.output);
    const checkId = await ctx.db.insert("checkResults", {
      workspaceId: workspace._id,
      versionId: version._id,
      revisionId: revision._id,
      outcome: result.outcome,
      parts: result.parts,
      ranBy: userId,
      ranAt: Date.now(),
      runOutcome: args.runOutcome,
      output: args.output.slice(0, STORED_OUTPUT_CHARS),
      outputTruncated: args.outputTruncated || args.output.length > STORED_OUTPUT_CHARS,
    });
    return { checkId, outcome: result.outcome, parts: result.parts };
  },
});

/**
 * The workspace's latest check, with whether it still describes the current
 * files (`fresh`) and the current task (`currentTask`).
 */
export const latest = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("checkResults"),
      ranAt: v.number(),
      versionNumber: v.number(),
      outcome: outcomeValidator,
      parts: v.array(partResultValidator),
      partialMin: v.number(),
      runOutcome: v.union(checkRunOutcomeValidator, v.null()),
      fresh: v.boolean(),
      currentTask: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const { workspace } = await requireOwnWorkspace(ctx, args.workspaceId);
    const check = await ctx.db
      .query("checkResults")
      .withIndex("by_workspaceId_and_ranAt", (q) => q.eq("workspaceId", workspace._id))
      .order("desc")
      .first();
    if (check === null) return null;
    const version = await ctx.db.get("workVersions", check.versionId);
    const revision = await ctx.db.get("assignmentRevisions", check.revisionId);
    const assignment = await ctx.db.get("assignments", workspace.assignmentId);
    const files = await workingFiles(ctx, workspace._id);
    return {
      _id: check._id,
      ranAt: check.ranAt,
      versionNumber: version?.number ?? 0,
      outcome: check.outcome,
      parts: check.parts,
      partialMin: revision?.partialMin ?? 0,
      runOutcome: check.runOutcome ?? null,
      fresh: version !== null && sameFiles(version.files, files),
      currentTask: assignment?.publishedRevisionId === check.revisionId,
    };
  },
});
