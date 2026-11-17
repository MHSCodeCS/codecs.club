import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getSettings, requireStudent } from "./lib/access";
import { adminFirstName } from "./lib/adminNames";
import { dayWork, lessonDateReached, lessonSchedule, schoolToday } from "./lib/dayAccess";
import { assignmentTypeValidator, groupValidator, outcomeValidator } from "./schema";

const MAX_DAYS = 100;

const assignmentSummaryValidator = v.object({
  _id: v.id("assignments"),
  title: v.string(),
  type: assignmentTypeValidator,
  summary: v.string(),
  started: v.boolean(),
  savedAt: v.union(v.number(), v.null()),
  turnedIn: v.boolean(),
  latestOutcome: v.union(outcomeValidator, v.null()),
});

const dayValidator = v.object({
  _id: v.id("days"),
  order: v.number(),
  topic: v.string(),
  lessonAt: v.union(v.number(), v.null()),
  /** Whether the student may open the day (D04); closed days list no assignments. */
  open: v.boolean(),
  assignments: v.array(assignmentSummaryValidator),
});

type AssignmentSummary = typeof assignmentSummaryValidator.type;

/**
 * Whether the student may open a day, and its published assignments with
 * their progress when they may. A day opens on its lesson date (D04) and
 * stays open to a student who already has work on it (D13).
 */
async function studentDay(
  ctx: QueryCtx,
  student: Doc<"students">,
  day: Doc<"days">,
  calendar: { year: string; timeZone: string; today: string },
): Promise<{ lessonAt: number | null; open: boolean; assignments: AssignmentSummary[] }> {
  const schedule = await lessonSchedule(ctx, day._id, calendar.year);
  const lessonAt = schedule?.lessonAt ?? null;
  const work = await dayWork(ctx, student._id, day._id);
  const open =
    lessonDateReached(lessonAt, calendar.today, calendar.timeZone) ||
    work.some((row) => row.workspace !== null);
  if (!open) return { lessonAt, open, assignments: [] };

  const assignments: AssignmentSummary[] = [];
  for (const { assignment, workspace } of work) {
    // Drafts and unpublished assignments never reach the day; work on them is kept.
    if (assignment.status !== "published" || !assignment.publishedRevisionId) continue;
    const revision = await ctx.db.get("assignmentRevisions", assignment.publishedRevisionId);
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
    assignments.push({
      _id: assignment._id,
      title: assignment.title,
      type: assignment.type,
      summary: revision?.summary ?? "",
      started: workspace !== null,
      savedAt: workspace?.updatedAt ?? null,
      turnedIn: latestSubmission !== null,
      latestOutcome: latestCheck?.outcome ?? null,
    });
  }
  return { lessonAt, open, assignments };
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
    const calendar = {
      year: settings.currentYear,
      timeZone: settings.timeZone,
      today: await schoolToday(ctx, settings.timeZone),
    };
    const days = [];
    for (const day of dayDocs) {
      days.push({
        _id: day._id,
        order: day.order,
        topic: day.topic,
        ...(await studentDay(ctx, student, day, calendar)),
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
      year: settings.currentYear,
      timeZone: settings.timeZone,
      days,
      latestFeedback,
    };
  },
});

/**
 * One lesson day in the student's current curriculum. A day that isn't open
 * yet (D04) returns only its number, topic and date, so the page can say
 * when it opens; its slides, cover and assignments stay hidden.
 */
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
        open: v.boolean(),
      }),
      assignments: v.array(assignmentSummaryValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx);
    const dayId = ctx.db.normalizeId("days", args.dayId);
    if (dayId === null) return null;
    const dayDoc = await ctx.db.get("days", dayId);
    // Only days in the student's current curriculum; past work is in My work.
    if (dayDoc === null || dayDoc.curriculumId !== student.curriculumId) return null;
    const settings = await getSettings(ctx);
    const curriculum = await ctx.db.get("curricula", dayDoc.curriculumId);
    const { lessonAt, open, assignments } = await studentDay(ctx, student, dayDoc, {
      year: settings.currentYear,
      timeZone: settings.timeZone,
      today: await schoolToday(ctx, settings.timeZone),
    });
    return {
      curriculumName: curriculum?.name ?? "",
      year: settings.currentYear,
      timeZone: settings.timeZone,
      day: {
        _id: dayDoc._id,
        order: dayDoc.order,
        topic: dayDoc.topic,
        slidesUrl: open ? (dayDoc.slidesUrl ?? null) : null,
        coverUrl:
          open && dayDoc.coverImageId ? await ctx.storage.getUrl(dayDoc.coverImageId) : null,
        lessonAt,
        open,
      },
      assignments,
    };
  },
});
