import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getSettings, requireAdmin } from "./lib/access";
import { adminName } from "./lib/adminNames";
import {
  changedFields,
  draftProblem,
  MAX_TITLE_LENGTH,
  normalizeDraft,
  publishProblem,
  sameDraft,
  type DraftContent,
} from "./lib/assignmentRules";
import { recordAdminChange } from "./lib/changes";
import { MAX_ASSIGNMENTS_PER_DAY } from "./lib/dayAccess";
import { appError } from "./lib/errors";
import { revisionContent, taskVersion, wasPublished } from "./lib/revisions";
import {
  assignmentTypeValidator,
  fileValidator,
  groupValidator,
  partKindValidator,
} from "./schema";

/**
 * Admin assignment authoring (Phase 7). An assignment's editable content lives
 * in its current revision. Saving edits a draft revision in place until it is
 * published; after that the next save starts a new revision, so a published
 * revision never changes and every check and turn-in keeps the rules it was
 * judged with (D08). Publishing makes the current revision the one students
 * see; unpublishing hides the assignment from lesson days but keeps every
 * student's work. Every write is recorded in admin change history.
 */

/** Workspaces counted for "N students have work on this". */
const MAX_WORK_COUNTED = 300;

export const draftValidator = v.object({
  title: v.string(),
  type: assignmentTypeValidator,
  summary: v.string(),
  instructions: v.string(),
  expectedOutput: v.string(),
  starterFiles: v.array(fileValidator),
  parts: v.array(v.object({ name: v.string(), kind: partKindValidator, expected: v.string() })),
  partialMin: v.number(),
  loopCheck: v.boolean(),
  checkInput: v.string(),
});

const statusValidator = v.union(v.literal("draft"), v.literal("published"));

const savedAtOf = (revision: Doc<"assignmentRevisions">) =>
  revision.updatedAt ?? revision.createdAt;

async function currentRevision(
  ctx: Pick<QueryCtx, "db">,
  assignment: Doc<"assignments">,
): Promise<Doc<"assignmentRevisions">> {
  const revision = assignment.currentRevisionId
    ? await ctx.db.get("assignmentRevisions", assignment.currentRevisionId)
    : null;
  if (revision === null) throw appError("NOT_FOUND", "This assignment has no content yet.");
  return revision;
}

/** The day's assignments in their order. */
async function dayAssignments(ctx: Pick<QueryCtx, "db">, dayId: Id<"days">) {
  return await ctx.db
    .query("assignments")
    .withIndex("by_dayId_and_order", (q) => q.eq("dayId", dayId))
    .take(MAX_ASSIGNMENTS_PER_DAY);
}

/** Renumbers a day's assignments 1, 2, 3, … in the given order. */
async function renumber(ctx: Pick<MutationCtx, "db">, assignments: Doc<"assignments">[]) {
  for (const [index, assignment] of assignments.entries()) {
    if (assignment.order !== index + 1) {
      await ctx.db.patch("assignments", assignment._id, { order: index + 1 });
    }
  }
}

/** Revision fields for draft content; empty optional texts are stored as unset. */
function revisionFields(draft: DraftContent) {
  return {
    title: draft.title,
    type: draft.type,
    summary: draft.summary,
    instructions: draft.instructions,
    expectedOutput: draft.expectedOutput || undefined,
    starterFiles: draft.starterFiles,
    parts: draft.parts,
    partialMin: draft.partialMin,
    loopCheck: draft.loopCheck,
    checkInput: draft.checkInput || undefined,
  };
}

const unpublishedChanges = (a: Doc<"assignments">) =>
  a.publishedRevisionId !== undefined && a.currentRevisionId !== a.publishedRevisionId;

/** One assignment's draft for the editor, with its day and the day's other assignments. */
export const get = query({
  args: { assignmentId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      timeZone: v.string(),
      assignment: v.object({
        _id: v.id("assignments"),
        /** What students see: the published title (or the draft's, if never published). */
        title: v.string(),
        type: assignmentTypeValidator,
        status: statusValidator,
        order: v.number(),
        /** Task version students see, or null if it was never published. */
        publishedVersion: v.union(v.number(), v.null()),
        publishedAt: v.union(v.number(), v.null()),
        /** The draft differs from the published task. */
        unpublishedChanges: v.boolean(),
      }),
      draft: v.object({
        revisionId: v.id("assignmentRevisions"),
        savedAt: v.number(),
        savedBy: v.string(),
        content: draftValidator,
      }),
      day: v.object({
        _id: v.id("days"),
        order: v.number(),
        topic: v.string(),
        curriculumName: v.string(),
        group: groupValidator,
      }),
      siblings: v.array(
        v.object({
          _id: v.id("assignments"),
          title: v.string(),
          type: assignmentTypeValidator,
          status: statusValidator,
          unpublishedChanges: v.boolean(),
        }),
      ),
      /** Students with a workspace on it (counted up to 300). */
      studentsWithWork: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const assignmentId = ctx.db.normalizeId("assignments", args.assignmentId);
    if (assignmentId === null) return null;
    const assignment = await ctx.db.get("assignments", assignmentId);
    if (assignment === null) return null;
    const day = await ctx.db.get("days", assignment.dayId);
    if (day === null) return null;
    const curriculum = await ctx.db.get("curricula", day.curriculumId);
    const settings = await getSettings(ctx);
    const current = await currentRevision(ctx, assignment);
    const published = assignment.publishedRevisionId
      ? await ctx.db.get("assignmentRevisions", assignment.publishedRevisionId)
      : null;
    const siblings = await dayAssignments(ctx, day._id);
    const work = await ctx.db
      .query("workspaces")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignment._id))
      .take(MAX_WORK_COUNTED);

    return {
      timeZone: settings.timeZone,
      assignment: {
        _id: assignment._id,
        title: assignment.title,
        type: assignment.type,
        status: assignment.status,
        order: assignment.order,
        publishedVersion: published ? taskVersion(published) : null,
        publishedAt: published ? (published.publishedAt ?? published.createdAt) : null,
        unpublishedChanges: unpublishedChanges(assignment),
      },
      draft: {
        revisionId: current._id,
        savedAt: savedAtOf(current),
        savedBy: await adminName(ctx, current.updatedBy ?? current.createdBy),
        content: revisionContent(current, assignment),
      },
      day: {
        _id: day._id,
        order: day.order,
        topic: day.topic,
        curriculumName: curriculum?.name ?? "",
        group: curriculum?.group ?? "basic",
      },
      siblings: siblings.map((a) => ({
        _id: a._id,
        title: a.title,
        type: a.type,
        status: a.status,
        unpublishedChanges: unpublishedChanges(a),
      })),
      studentsWithWork: work.length,
    };
  },
});

/** Adds a draft assignment at the end of a day and returns its id. */
export const create = mutation({
  args: { dayId: v.id("days"), title: v.string(), type: assignmentTypeValidator },
  returns: v.id("assignments"),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (day === null) throw appError("NOT_FOUND", "Day not found.");
    const title = args.title.trim();
    if (title.length === 0) throw appError("INVALID", "Give the assignment a title.");
    if (title.length > MAX_TITLE_LENGTH) {
      throw appError("INVALID", `Keep the title under ${MAX_TITLE_LENGTH} characters.`);
    }
    const siblings = await dayAssignments(ctx, day._id);
    if (siblings.length >= MAX_ASSIGNMENTS_PER_DAY) {
      throw appError("INVALID", `A day can have at most ${MAX_ASSIGNMENTS_PER_DAY} assignments.`);
    }

    const now = Date.now();
    const assignmentId = await ctx.db.insert("assignments", {
      dayId: day._id,
      order: (siblings.at(-1)?.order ?? 0) + 1,
      type: args.type,
      title,
      status: "draft",
    });
    const revisionId = await ctx.db.insert("assignmentRevisions", {
      assignmentId,
      title,
      type: args.type,
      summary: "",
      instructions: "",
      starterFiles: [{ name: "main.py", content: "" }],
      parts: [],
      partialMin: 0,
      loopCheck: false,
      createdBy: userId,
      createdAt: now,
      updatedBy: userId,
      updatedAt: now,
    });
    await ctx.db.patch("assignments", assignmentId, { currentRevisionId: revisionId });
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "assignments",
      recordId: assignmentId,
      summary: `Created ${title} on Day ${day.order}`,
      after: { status: "draft", type: args.type },
    });
    return assignmentId;
  },
});

/**
 * Saves the editor's draft. `baseRevisionId` and `baseSavedAt` are what the
 * editor started from; if someone else saved since, nothing is overwritten.
 * A published revision is never edited: the first save after publishing
 * starts a new draft revision.
 */
export const saveDraft = mutation({
  args: {
    assignmentId: v.id("assignments"),
    baseRevisionId: v.id("assignmentRevisions"),
    baseSavedAt: v.number(),
    draft: draftValidator,
  },
  returns: v.object({
    revisionId: v.id("assignmentRevisions"),
    savedAt: v.number(),
    changed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const assignment = await ctx.db.get("assignments", args.assignmentId);
    if (assignment === null) throw appError("NOT_FOUND", "Assignment not found.");
    const current = await currentRevision(ctx, assignment);
    if (current._id !== args.baseRevisionId || savedAtOf(current) !== args.baseSavedAt) {
      throw appError(
        "CONFLICT",
        "Someone else saved this assignment after you opened it. Copy anything you need, then reload.",
      );
    }
    const draft = normalizeDraft(args.draft);
    const problem = draftProblem(draft);
    if (problem !== null) throw appError("INVALID", problem);

    const before = normalizeDraft(revisionContent(current, assignment));
    if (sameDraft(before, draft)) {
      return { revisionId: current._id, savedAt: savedAtOf(current), changed: false };
    }

    const now = Date.now();
    let revisionId = current._id;
    if (wasPublished(current, assignment)) {
      revisionId = await ctx.db.insert("assignmentRevisions", {
        assignmentId: assignment._id,
        ...revisionFields(draft),
        createdBy: userId,
        createdAt: now,
        updatedBy: userId,
        updatedAt: now,
      });
      await ctx.db.patch("assignments", assignment._id, { currentRevisionId: revisionId });
    } else {
      await ctx.db.patch("assignmentRevisions", current._id, {
        ...revisionFields(draft),
        updatedBy: userId,
        updatedAt: now,
      });
    }
    if (assignment.publishedRevisionId === undefined) {
      // Never published, so admin lists show the draft's title and type.
      await ctx.db.patch("assignments", assignment._id, { title: draft.title, type: draft.type });
    }
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "assignments",
      recordId: assignment._id,
      summary: `Saved a draft of ${draft.title}`,
      // Which fields changed, never the task text itself.
      after: { changed: changedFields(before, draft).join(", ") },
    });
    return { revisionId, savedAt: now, changed: true };
  },
});

/**
 * Publishes the current draft revision. `revisionId` is the draft the admin
 * is looking at, so a newer save by someone else is never published unseen.
 * Students' files, earlier checks and turn-ins are not touched (D08).
 */
export const publish = mutation({
  args: { assignmentId: v.id("assignments"), revisionId: v.id("assignmentRevisions") },
  returns: v.object({ version: v.number(), publishedAt: v.number() }),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const assignment = await ctx.db.get("assignments", args.assignmentId);
    if (assignment === null) throw appError("NOT_FOUND", "Assignment not found.");
    if (assignment.currentRevisionId !== args.revisionId) {
      throw appError("CONFLICT", "This assignment changed after you opened it. Reload, then publish.");
    }
    const revision = await currentRevision(ctx, assignment);
    const content = normalizeDraft(revisionContent(revision, assignment));
    const problem = publishProblem(content);
    if (problem !== null) throw appError("INVALID", problem);
    const day = await ctx.db.get("days", assignment.dayId);
    const where = day ? `Day ${day.order}` : "its day";

    if (assignment.publishedRevisionId === revision._id) {
      // Nothing changed since it was last published; just show it again.
      if (assignment.status !== "published") {
        await ctx.db.patch("assignments", assignment._id, { status: "published" });
        await recordAdminChange(ctx, {
          actorId: userId,
          table: "assignments",
          recordId: assignment._id,
          summary: `Published ${assignment.title} on ${where} again`,
          before: { status: assignment.status },
          after: { status: "published", version: taskVersion(revision) },
        });
      }
      return {
        version: taskVersion(revision),
        publishedAt: revision.publishedAt ?? revision.createdAt,
      };
    }

    const previous = assignment.publishedRevisionId
      ? await ctx.db.get("assignmentRevisions", assignment.publishedRevisionId)
      : null;
    const version = previous ? taskVersion(previous) + 1 : 1;
    const now = Date.now();
    await ctx.db.patch("assignmentRevisions", revision._id, {
      version,
      publishedAt: now,
      publishedBy: userId,
    });
    await ctx.db.patch("assignments", assignment._id, {
      status: "published",
      publishedRevisionId: revision._id,
      title: content.title,
      type: content.type,
    });
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "assignments",
      recordId: assignment._id,
      summary: previous
        ? `Published task version ${version} of ${content.title}`
        : `Published ${content.title} on ${where}`,
      before: { status: assignment.status, version: previous ? taskVersion(previous) : null },
      after: { status: "published", version },
    });
    return { version, publishedAt: now };
  },
});

/** Hides a published assignment from lesson days. Students keep their work on it. */
export const unpublish = mutation({
  args: { assignmentId: v.id("assignments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const assignment = await ctx.db.get("assignments", args.assignmentId);
    if (assignment === null) throw appError("NOT_FOUND", "Assignment not found.");
    if (assignment.status !== "published") return null;
    await ctx.db.patch("assignments", assignment._id, { status: "draft" });
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "assignments",
      recordId: assignment._id,
      summary: `Unpublished ${assignment.title}`,
      before: { status: "published" },
      after: { status: "draft" },
    });
    return null;
  },
});

/** Moves an assignment one place earlier or later on its day. */
export const move = mutation({
  args: {
    assignmentId: v.id("assignments"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const assignment = await ctx.db.get("assignments", args.assignmentId);
    if (assignment === null) throw appError("NOT_FOUND", "Assignment not found.");
    const siblings = await dayAssignments(ctx, assignment.dayId);
    const from = siblings.findIndex((a) => a._id === assignment._id);
    const to = args.direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= siblings.length) return null;
    [siblings[from], siblings[to]] = [siblings[to]!, siblings[from]!];
    await renumber(ctx, siblings);
    const day = await ctx.db.get("days", assignment.dayId);
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "assignments",
      recordId: assignment._id,
      summary: `Moved ${assignment.title} ${args.direction} on Day ${day?.order ?? "?"}`,
      before: { position: from + 1 },
      after: { position: to + 1 },
    });
    return null;
  },
});

/** Removes a draft no student has opened, with all its revisions. */
export const remove = mutation({
  args: { assignmentId: v.id("assignments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const assignment = await ctx.db.get("assignments", args.assignmentId);
    if (assignment === null) throw appError("NOT_FOUND", "Assignment not found.");
    if (assignment.status === "published") {
      throw appError("INVALID", "Unpublish it first. Only drafts can be removed.");
    }
    const work = await ctx.db
      .query("workspaces")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignment._id))
      .first();
    if (work !== null) {
      throw appError(
        "CONFLICT",
        "Students have work on this assignment, so it can’t be removed. Leave it unpublished to keep it hidden.",
      );
    }
    for await (const revision of ctx.db
      .query("assignmentRevisions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignment._id))) {
      await ctx.db.delete("assignmentRevisions", revision._id);
    }
    await ctx.db.delete("assignments", assignment._id);
    await renumber(
      ctx,
      (await dayAssignments(ctx, assignment.dayId)).filter((a) => a._id !== assignment._id),
    );
    const day = await ctx.db.get("days", assignment.dayId);
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "assignments",
      recordId: assignment._id,
      summary: `Removed the draft ${assignment.title} from Day ${day?.order ?? "?"}`,
      before: { status: assignment.status, type: assignment.type },
    });
    return null;
  },
});
