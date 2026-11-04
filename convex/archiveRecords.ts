import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import schema from "./schema";

export const workspaces = query({
  args: { assignmentId: v.id("assignments"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("workspaces").extend({ name: v.string() })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db.query("workspaces").withIndex("by_assignmentId", q => q.eq("assignmentId", args.assignmentId)).paginate(args.paginationOpts);
    return { ...result, page: await Promise.all(result.page.map(async workspace => {
      const student = await ctx.db.get("students", workspace.studentId);
      return { ...workspace, name: student ? `${student.firstName} ${student.lastName}` : "Former student" };
    })) };
  },
});
export const files = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(schema.doc("workFiles")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.query("workFiles").withIndex("by_workspaceId_and_name", q => q.eq("workspaceId", args.workspaceId)).take(100);
  },
});
export const submissions = query({
  args: { workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("submissions").extend({ version: v.union(schema.doc("workVersions"), v.null()) })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db.query("submissions").withIndex("by_workspaceId_and_attempt", q => q.eq("workspaceId", args.workspaceId)).order("desc").paginate(args.paginationOpts);
    return { ...result, page: await Promise.all(result.page.map(async submission => ({ ...submission, version: await ctx.db.get("workVersions", submission.versionId) }))) };
  },
});
export const feedback = query({
  args: { submissionId: v.id("submissions"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("feedback")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.query("feedback").withIndex("by_submissionId", q => q.eq("submissionId", args.submissionId)).paginate(args.paginationOpts);
  },
});
