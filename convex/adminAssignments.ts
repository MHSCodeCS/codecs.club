import { writableCurriculum } from "./lib/classes";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import schema, { assignmentTypeValidator, fileValidator, groupValidator, partKindValidator } from "./schema";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { recordAdminChange } from "./lib/changes";
import { appError } from "./lib/errors";
import { validatePartialRule } from "./lib/evaluation";
import { byteLength, fileNameProblem, fileSizeProblem, MAX_FILES, MAX_WORKSPACE_BYTES } from "./lib/workFiles";

const contentValidator = v.object({ title: v.string(), type: assignmentTypeValidator, summary: v.string(), instructions: v.string(), expectedOutput: v.string(),
  starterFiles: v.array(fileValidator), parts: v.array(v.object({ name: v.string(), kind: partKindValidator, expected: v.string() })), partialMin: v.number(), loopCheck: v.boolean(), checkInput: v.string() });

export const catalog = query({
  args: { group: groupValidator },
  returns: v.array(v.object({ _id: v.id("curricula"), name: v.string(), days: v.array(v.object({ _id: v.id("days"), order: v.number(), topic: v.string(), assignments: v.array(v.object({ _id: v.id("assignments"), title: v.string(), type: assignmentTypeValidator, status: v.union(v.literal("draft"), v.literal("published")), hasDraft: v.boolean() })) })) })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const curricula = await ctx.db.query("curricula").withIndex("by_group", q => q.eq("group", args.group)).take(50);
    return await Promise.all(curricula.map(async curriculum => ({ _id: curriculum._id, name: curriculum.name,
      days: await Promise.all((await ctx.db.query("days").withIndex("by_curriculumId_and_order", q => q.eq("curriculumId", curriculum._id)).take(100)).map(async day => ({ _id: day._id, order: day.order, topic: day.topic,
        assignments: await Promise.all((await ctx.db.query("assignments").withIndex("by_dayId_and_order", q => q.eq("dayId", day._id)).take(50)).map(async a => {
          const revision = a.currentRevisionId ? await ctx.db.get("assignmentRevisions", a.currentRevisionId) : null;
          return { _id: a._id, title: revision?.title ?? a.title, type: revision?.type ?? a.type, status: a.status, hasDraft: a.currentRevisionId !== a.publishedRevisionId };
        })) }))) })));
  },
});

export const get = query({
  args: { assignmentId: v.string() },
  returns: v.union(v.null(), v.object({ assignment: schema.doc("assignments"), revision: v.union(v.null(), schema.doc("assignmentRevisions")), day: schema.doc("days"), curriculum: schema.doc("curricula") })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const id = ctx.db.normalizeId("assignments", args.assignmentId);
    if (!id) return null;
    const assignment = await ctx.db.get("assignments", id);
    if (!assignment) return null;
    const day = await ctx.db.get("days", assignment.dayId);
    const curriculum = day ? await ctx.db.get("curricula", day.curriculumId) : null;
    if (!day || !curriculum) return null;
    return { assignment, day, curriculum, revision: assignment.currentRevisionId ? await ctx.db.get("assignmentRevisions", assignment.currentRevisionId) : null };
  },
});

/** Every save appends a revision. Draft edits never alter the student-facing title/type. */
export const save = mutation({
  args: { assignmentId: v.optional(v.id("assignments")), dayId: v.id("days"), baseRevisionId: v.union(v.id("assignmentRevisions"), v.null()), publish: v.boolean(), content: contentValidator },
  returns: v.object({ assignmentId: v.id("assignments"), revisionId: v.id("assignmentRevisions") }),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (!day) throw appError("NOT_FOUND", "Lesson not found.");
    await writableCurriculum(ctx, day.curriculumId);
    const content = { ...args.content, title: args.content.title.trim() };
    if (!content.title || content.title.length > 150) throw appError("INVALID", "Give the assignment a title of 1–150 characters.");
    if (content.summary.length > 1000 || content.instructions.length > 50000 || content.expectedOutput.length > 20000 || content.checkInput.length > 20000 || content.parts.length > 32 || byteLength(JSON.stringify(content)) > 800000) throw appError("INVALID", "Assignment content is too large.");
    if (!Number.isInteger(content.partialMin) || content.partialMin < 0) throw appError("INVALID", "Partial minimum must be a whole number of parts.");
    if (content.starterFiles.length < 1 || content.starterFiles.length > MAX_FILES) throw appError("INVALID", "Use 1–20 starter files.");
    const names = new Set<string>(); let bytes = 0;
    for (const file of content.starterFiles) {
      const problem = fileNameProblem(file.name) ?? fileSizeProblem(file.name, file.content);
      if (problem) throw appError("INVALID", problem);
      if (names.has(file.name.toLowerCase())) throw appError("INVALID", "Starter file names must be unique.");
      names.add(file.name.toLowerCase()); bytes += byteLength(file.content);
    }
    if (bytes > MAX_WORKSPACE_BYTES) throw appError("INVALID", "Starter files must total at most 400 KB.");
    if (args.publish) {
      if (!content.instructions.trim()) throw appError("INVALID", "Add instructions before publishing.");
      if (content.type === "guided") {
        if (content.partialMin > content.parts.length) throw appError("INVALID", "Partial minimum cannot exceed the number of parts.");
        const rule = validatePartialRule(content.parts.length, content.partialMin);
        if (!rule.ok) throw appError("INVALID", rule.message);
        if (content.parts.some(p => !p.name.trim() || p.name.length > 150 || p.expected.length > 20000 || !p.expected.replace(/\s/g, ""))) throw appError("INVALID", "Each check needs a name and expected output.");
      }
    }
    if (content.type === "open") {
      content.starterFiles = [{ name: "main.py", content: "" }]; content.parts = []; content.partialMin = 0; content.loopCheck = false; content.checkInput = ""; content.expectedOutput = "";
    }
    const assignment = args.assignmentId ? await ctx.db.get("assignments", args.assignmentId) : null;
    if (args.assignmentId && !assignment) throw appError("NOT_FOUND", "Assignment not found.");
    if (assignment && (assignment.dayId !== args.dayId || (assignment.currentRevisionId ?? null) !== args.baseRevisionId)) throw appError("CONFLICT", "This assignment changed in another tab. Reload it before saving.");
    if (!assignment && args.baseRevisionId) throw appError("INVALID", "A new assignment cannot reuse a revision.");
    let assignmentId = assignment?._id;
    if (!assignmentId) {
      const last = await ctx.db.query("assignments").withIndex("by_dayId_and_order", q => q.eq("dayId", day._id)).order("desc").first();
      if ((last?.order ?? 0) >= 50) throw appError("INVALID", "A lesson supports at most 50 assignments.");
      assignmentId = await ctx.db.insert("assignments", { dayId: day._id, order: (last?.order ?? 0) + 1, title: content.title, type: content.type, status: "draft" });
    }
    const revisionId = await ctx.db.insert("assignmentRevisions", { assignmentId, ...content, createdBy: userId, createdAt: Date.now() });
    await ctx.db.patch("assignments", assignmentId, { currentRevisionId: revisionId,
      ...(args.publish ? { title: content.title, type: content.type, status: "published" as const, publishedRevisionId: revisionId } : {}) });
    await recordAdminChange(ctx, { actorId: userId, table: "assignments", recordId: assignmentId, summary: `${args.publish ? "Published" : "Saved draft:"} ${content.title}`, before: assignment ? { currentRevisionId: assignment.currentRevisionId, publishedRevisionId: assignment.publishedRevisionId } : undefined, after: { currentRevisionId: revisionId, publishedRevisionId: args.publish ? revisionId : assignment?.publishedRevisionId } });
    return { assignmentId, revisionId };
  },
});

export const revisions = query({
  args: { assignmentId: v.id("assignments"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ _id: v.id("assignmentRevisions"), createdAt: v.number(), author: v.string(), published: v.boolean(), current: v.boolean() })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const assignment = await ctx.db.get("assignments", args.assignmentId);
    if (!assignment) throw appError("NOT_FOUND", "Assignment not found.");
    const result = await ctx.db.query("assignmentRevisions").withIndex("by_assignmentId", q => q.eq("assignmentId", assignment._id)).order("desc").paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map(async r => {
      const author = await ctx.db.query("admins").withIndex("by_userId", q => q.eq("userId", r.createdBy)).unique();
      return { _id: r._id, createdAt: r.createdAt, author: author?.displayName ?? "Teacher", published: r._id === assignment.publishedRevisionId, current: r._id === assignment.currentRevisionId };
    }));
    return { ...result, page };
  },
});
export const revision = query({
  args: { revisionId: v.id("assignmentRevisions") }, returns: v.union(v.null(), schema.doc("assignmentRevisions")),
  handler: async (ctx, args) => { await requireAdmin(ctx); return await ctx.db.get("assignmentRevisions", args.revisionId); },
});
