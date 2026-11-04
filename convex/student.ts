import { adminFirstName } from "./lib/adminNames";
import { classYear, classFor } from "./lib/classes";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getSettings, requireStudent } from "./lib/access";
import { assignmentTypeValidator, groupValidator, outcomeValidator, reviewDecisionValidator } from "./schema";

const MAX_DAYS = 100;
const MAX_ASSIGNMENTS_PER_DAY = 50;

const assignmentSummaryValidator = v.object({
  _id: v.id("assignments"),
  title: v.string(),
  type: assignmentTypeValidator,
  summary: v.string(),
  started: v.boolean(),
  savedAt: v.union(v.number(), v.null()),
  turnedIn: v.boolean(),
  reviewed: v.boolean(),
  reviewDecision: v.union(reviewDecisionValidator, v.null()),
  latestOutcome: v.union(outcomeValidator, v.null()),
});

export const dayValidator = v.object({
  _id: v.id("days"),
  order: v.number(),
  topic: v.string(),
  lessonAt: v.union(v.number(), v.null()),
  assignments: v.array(assignmentSummaryValidator),
});

type AssignmentSummary = typeof assignmentSummaryValidator.type;

/** Published assignments on a day, with this student's progress on each. */
export async function assignmentSummaries(
  ctx: QueryCtx,
  student: Doc<"students">,
  dayId: Id<"days">,
): Promise<AssignmentSummary[]> {
  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_dayId_and_order", (q) => q.eq("dayId", dayId))
    .take(MAX_ASSIGNMENTS_PER_DAY);
  const summaries: AssignmentSummary[] = [];
  for (const assignment of assignments) {
    // Drafts never reach students.
    if (assignment.status !== "published" || !assignment.publishedRevisionId) continue;
    const revision = await ctx.db.get("assignmentRevisions", assignment.publishedRevisionId);
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_studentId_and_assignmentId", (q) =>
        q.eq("studentId", student._id).eq("assignmentId", assignment._id),
      )
      .unique();
    const latestSubmission = workspace
      ? await ctx.db
          .query("submissions")
          .withIndex("by_workspaceId_and_attempt", (q) => q.eq("workspaceId", workspace._id))
          .order("desc")
          .first()
      : null;
    const latestCheck = workspace
      ? await ctx.db
          .query("checkResults")
          .withIndex("by_workspaceId_and_ranAt", (q) => q.eq("workspaceId", workspace._id))
          .order("desc")
          .first()
      : null;
    summaries.push({
      _id: assignment._id,
      title: assignment.title,
      type: assignment.type,
      summary: revision?.summary ?? "",
      started: workspace !== null,
      savedAt: workspace?.updatedAt ?? null,
      turnedIn: latestSubmission !== null,
      reviewed: latestSubmission?.status === "reviewed",
      reviewDecision: latestSubmission?.reviewDecision ?? null,
      latestOutcome: latestCheck?.outcome ?? null,
    });
  }
  return summaries;
}

async function scheduleFor(ctx: QueryCtx, dayId: Id<"days">, year: string) {
  return await ctx.db
    .query("lessonSchedules")
    .withIndex("by_dayId_and_year", (q) => q.eq("dayId", dayId).eq("year", year))
    .unique();
}

/** Learning home: the student's current curriculum as an ordered day track. */
export const home = query({
  args: {},
  returns: v.object({
    student: v.object({
      firstName: v.string(),
      lastName: v.string(),
      loginCode: v.string(),
      group: groupValidator,
    }),
    curriculum: v.object({ _id: v.id("curricula"), name: v.string() }),
    className: v.string(),
    year: v.string(),
    timeZone: v.string(),
    days: v.array(dayValidator),
    latestFeedback: v.union(
      v.null(),
      v.object({
        assignmentTitle: v.string(),
        authorName: v.string(),
        body: v.string(),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const { student } = await requireStudent(ctx);
    const settings = await getSettings(ctx);
    const curriculum = await ctx.db.get("curricula", student.curriculumId);
    if (curriculum === null) throw new Error("Student curriculum is missing.");

    const dayDocs = await ctx.db
      .query("days")
      .withIndex("by_curriculumId_and_order", (q) => q.eq("curriculumId", curriculum._id))
      .take(MAX_DAYS);
    const classroom = await classFor(ctx, student.group);
    const days = [];
    for (const day of classroom && classroom.status !== "current" ? [] : dayDocs) {
      const schedule = await scheduleFor(ctx, day._id, await classYear(ctx, student.group));
      days.push({
        _id: day._id,
        order: day.order,
        topic: day.topic,
        lessonAt: schedule?.lessonAt ?? null,
        assignments: await assignmentSummaries(ctx, student, day._id),
      });
    }

    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_studentId_and_visibility_and_createdAt", (q) =>
        q.eq("studentId", student._id).eq("visibility", "student"),
      )
      .order("desc")
      .first();
    let latestFeedback = null;
    if (feedback !== null) {
      const submission = await ctx.db.get("submissions", feedback.submissionId);
      const assignment = submission
        ? await ctx.db.get("assignments", submission.assignmentId)
        : null;
      latestFeedback = {
        assignmentTitle: assignment?.title ?? "Assignment",
        authorName: await adminFirstName(ctx, feedback.authorId),
        body: feedback.body,
        createdAt: feedback.createdAt,
      };
    }

    return {
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        loginCode: student.loginCode,
        group: student.group,
      },
      curriculum: { _id: curriculum._id, name: curriculum.name },
      className: classroom?.name ?? (student.group === "basic" ? "Basic" : student.group === "advanced" ? "Advanced" : "Your class"),
      year: await classYear(ctx, student.group),
      timeZone: settings.timeZone,
      days,
      latestFeedback,
    };
  },
});

/** One lesson day in the student's current curriculum. */
export const day = query({
  args: { dayId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      curriculumName: v.string(),
      year: v.string(),
      timeZone: v.string(),
      day: v.object({
        _id: v.id("days"),
        order: v.number(),
        topic: v.string(),
        slidesUrl: v.union(v.string(), v.null()),
        coverUrl: v.union(v.string(), v.null()),
        lessonAt: v.union(v.number(), v.null()),
      }),
      assignments: v.array(assignmentSummaryValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx);
    const classroom = await classFor(ctx, student.group);
    if (classroom && classroom.status !== "current") return null;
    const dayId = ctx.db.normalizeId("days", args.dayId);
    if (dayId === null) return null;
    const dayDoc = await ctx.db.get("days", dayId);
    // Only days in the student's current curriculum; past work is in My work.
    if (dayDoc === null || dayDoc.curriculumId !== student.curriculumId) return null;
    const settings = await getSettings(ctx);
    const curriculum = await ctx.db.get("curricula", dayDoc.curriculumId);
    const schedule = await scheduleFor(ctx, dayDoc._id, await classYear(ctx, student.group));
    return {
      curriculumName: curriculum?.name ?? "",
      year: await classYear(ctx, student.group),
      timeZone: settings.timeZone,
      day: {
        _id: dayDoc._id,
        order: dayDoc.order,
        topic: dayDoc.topic,
        slidesUrl: dayDoc.slidesUrl ?? null,
        coverUrl: dayDoc.coverImageId ? await ctx.storage.getUrl(dayDoc.coverImageId) : null,
        lessonAt: schedule?.lessonAt ?? null,
      },
      assignments: await assignmentSummaries(ctx, student, dayDoc._id),
    };
  },
});
