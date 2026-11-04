import { firstName } from "./lib/adminNames";
import { classYear, classFor } from "./lib/classes";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getSettings, requireStudent } from "./lib/access";
import { assignmentTypeValidator, fileValidator, groupValidator, outcomeValidator, submissionStatusValidator, reviewDecisionValidator } from "./schema";

const row = v.object({
  _id: v.id("workspaces"), assignmentId: v.id("assignments"), title: v.string(), type: assignmentTypeValidator,
  dayOrder: v.number(), topic: v.string(), year: v.string(), group: groupValidator,
  curriculumId: v.id("curricula"), curriculumName: v.string(), current: v.boolean(), timeZone: v.string(),
  updatedAt: v.number(),
  latestAttempt: v.union(v.null(), v.object({ attempt: v.number(), status: submissionStatusValidator, reviewDecision: v.optional(reviewDecisionValidator), reviewedAt: v.union(v.number(), v.null()) })),
});

/** Every saved workspace owned by this student, including prior curricula and years. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(row),
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx);
    const settings = await getSettings(ctx);
    const classroom = await classFor(ctx, student.group);
    const result = await ctx.db.query("workspaces").withIndex("by_studentId_and_updatedAt", q => q.eq("studentId", student._id)).order("desc").paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map(async workspace => {
      const assignment = await ctx.db.get("assignments", workspace.assignmentId);
      const day = assignment ? await ctx.db.get("days", assignment.dayId) : null;
      const curriculum = await ctx.db.get("curricula", workspace.curriculumId);
      const latest = await ctx.db.query("submissions").withIndex("by_workspaceId_and_attempt", q => q.eq("workspaceId", workspace._id)).order("desc").first();
      return { _id: workspace._id, assignmentId: workspace.assignmentId, title: assignment?.title ?? "Saved assignment", type: assignment?.type ?? "open" as const,
        dayOrder: day?.order ?? 0, topic: day?.topic ?? "Past lesson", year: workspace.year, group: workspace.group, curriculumId: workspace.curriculumId,
        curriculumName: curriculum?.name ?? "Previous curriculum", current: classroom?.status !== "archived" && workspace.year === await classYear(ctx, student.group) && workspace.curriculumId === student.curriculumId && workspace.group === student.group,
        timeZone: settings.timeZone, updatedAt: workspace.updatedAt,
        latestAttempt: latest ? { attempt: latest.attempt, status: latest.status, reviewDecision: latest.reviewDecision, reviewedAt: latest.reviewedAt ?? null } : null };
    }));
    return { ...result, page };
  },
});

const attempt = v.object({ _id: v.id("submissions"), attempt: v.number(), submittedAt: v.number(), version: v.number(), status: submissionStatusValidator, reviewDecision: v.optional(reviewDecisionValidator),
  outcome: v.union(outcomeValidator, v.null()), reviewedAt: v.union(v.number(), v.null()), reviewer: v.union(v.string(), v.null()),
  feedback: v.array(v.object({ body: v.string(), author: v.string(), createdAt: v.number() })),
});
export const attempts = query({
  args: { workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(attempt),
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx);
    const workspace = await ctx.db.get("workspaces", args.workspaceId);
    if (!workspace || workspace.studentId !== student._id) return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db.query("submissions").withIndex("by_workspaceId_and_attempt", q => q.eq("workspaceId", workspace._id)).order("desc").paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map(async submission => {
      const version = await ctx.db.get("workVersions", submission.versionId);
      const check = submission.checkResultId ? await ctx.db.get("checkResults", submission.checkResultId) : null;
      const reviewer = submission.reviewedBy ? await ctx.db.query("admins").withIndex("by_userId", q => q.eq("userId", submission.reviewedBy!)).unique() : null;
      const notes = await ctx.db.query("feedback").withIndex("by_submissionId", q => q.eq("submissionId", submission._id)).take(20);
      const feedback = await Promise.all(notes.filter(n => n.visibility === "student").map(async note => {
        const author = await ctx.db.query("admins").withIndex("by_userId", q => q.eq("userId", note.authorId)).unique();
        return { body: note.body, author: firstName(author?.displayName ?? "CodeCS"), createdAt: note.createdAt };
      }));
      return { _id: submission._id, attempt: submission.attempt, submittedAt: submission.submittedAt, version: version?.number ?? 0, status: submission.status, reviewDecision: submission.reviewDecision,
        outcome: check?.outcome ?? null, reviewedAt: submission.reviewedAt ?? null, reviewer: reviewer ? firstName(reviewer.displayName) : null, feedback };
    }));
    return { ...result, page };
  },
});

/** Immutable submitted files; private teacher notes are never included. */
export const submittedFiles = query({
  args: { submissionId: v.id("submissions") }, returns: v.union(v.null(), v.array(fileValidator)),
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx);
    const submission = await ctx.db.get("submissions", args.submissionId);
    if (!submission || submission.studentId !== student._id) return null;
    const workspace = await ctx.db.get("workspaces", submission.workspaceId);
    if (!workspace || workspace.studentId !== student._id) return null;
    const version = await ctx.db.get("workVersions", submission.versionId);
    return version && version.workspaceId === workspace._id ? version.files : null;
  },
});
