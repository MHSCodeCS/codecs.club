import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getSettings, requireAdmin } from "./lib/access";
import { MAX_TITLE_LENGTH } from "./lib/assignmentRules";
import { recordAdminChange } from "./lib/changes";
import { coverProblem } from "./lib/covers";
import { appError } from "./lib/errors";
import { parseClockTime, zonedTimeToUtc } from "./lib/time";
import { assignmentTypeValidator, groupValidator } from "./schema";

const MAX_DAYS = 100;
/** Lesson schedules per day: one per school year. */
const MAX_SCHEDULES_PER_DAY = 50;
const MAX_TOPIC_LENGTH = MAX_TITLE_LENGTH;

async function curriculumDays(ctx: Pick<QueryCtx, "db">, curriculumId: Id<"curricula">) {
  return await ctx.db
    .query("days")
    .withIndex("by_curriculumId_and_order", (q) => q.eq("curriculumId", curriculumId))
    .take(MAX_DAYS);
}

/** Renumbers a curriculum's days 1, 2, 3, … in the given order. */
async function renumberDays(ctx: Pick<MutationCtx, "db">, days: Doc<"days">[]) {
  for (const [index, day] of days.entries()) {
    if (day.order !== index + 1) await ctx.db.patch("days", day._id, { order: index + 1 });
  }
}

function topicProblem(topic: string): string | null {
  if (topic.length === 0) return "Give the day a topic.";
  if (topic.length > MAX_TOPIC_LENGTH) return `Keep the topic under ${MAX_TOPIC_LENGTH} characters.`;
  return null;
}

/** A curriculum's days with content, assignments and one year's schedule. */
export const overview = query({
  args: {
    group: groupValidator,
    curriculumId: v.optional(v.string()),
    year: v.optional(v.string()),
  },
  returns: v.object({
    year: v.string(),
    currentYear: v.string(),
    timeZone: v.string(),
    curricula: v.array(v.object({ _id: v.id("curricula"), name: v.string() })),
    curriculum: v.union(v.null(), v.object({ _id: v.id("curricula"), name: v.string() })),
    days: v.array(
      v.object({
        _id: v.id("days"),
        order: v.number(),
        topic: v.string(),
        slidesUrl: v.union(v.string(), v.null()),
        coverUrl: v.union(v.string(), v.null()),
        schedule: v.union(
          v.null(),
          v.object({ _id: v.id("lessonSchedules"), lessonAt: v.number() }),
        ),
        assignments: v.array(
          v.object({
            _id: v.id("assignments"),
            title: v.string(),
            type: assignmentTypeValidator,
            status: v.union(v.literal("draft"), v.literal("published")),
            /** Published, with saved edits students don't see yet. */
            unpublishedChanges: v.boolean(),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const settings = await getSettings(ctx);
    const year = args.year ?? settings.currentYear;
    const curricula = await ctx.db
      .query("curricula")
      .withIndex("by_group", (q) => q.eq("group", args.group))
      .take(50);
    const requestedId = args.curriculumId
      ? ctx.db.normalizeId("curricula", args.curriculumId)
      : null;
    const curriculum =
      curricula.find((c) => c._id === requestedId) ??
      // Default to the curriculum most recently created for the group.
      curricula[curricula.length - 1] ??
      null;

    const days = [];
    if (curriculum !== null) {
      for (const day of await curriculumDays(ctx, curriculum._id)) {
        const schedule = await ctx.db
          .query("lessonSchedules")
          .withIndex("by_dayId_and_year", (q) => q.eq("dayId", day._id).eq("year", year))
          .unique();
        const assignments = await ctx.db
          .query("assignments")
          .withIndex("by_dayId_and_order", (q) => q.eq("dayId", day._id))
          .take(50);
        days.push({
          _id: day._id,
          order: day.order,
          topic: day.topic,
          slidesUrl: day.slidesUrl ?? null,
          coverUrl: day.coverImageId ? await ctx.storage.getUrl(day.coverImageId) : null,
          schedule: schedule ? { _id: schedule._id, lessonAt: schedule.lessonAt } : null,
          assignments: assignments.map((a) => ({
            _id: a._id,
            title: a.title,
            type: a.type,
            status: a.status,
            unpublishedChanges:
              a.publishedRevisionId !== undefined && a.currentRevisionId !== a.publishedRevisionId,
          })),
        });
      }
    }

    return {
      year,
      currentYear: settings.currentYear,
      timeZone: settings.timeZone,
      curricula: curricula.map((c) => ({ _id: c._id, name: c.name })),
      curriculum: curriculum ? { _id: curriculum._id, name: curriculum.name } : null,
      days,
    };
  },
});

/**
 * Sets a day's lesson date for one year. Turn-in never closes, so this moves
 * only the lesson date (decision D06).
 */
export const setSchedule = mutation({
  args: {
    dayId: v.id("days"),
    year: v.string(),
    /** Local date in the school time zone, "YYYY-MM-DD". */
    date: v.string(),
    /** Local start time, "HH:MM". */
    time: v.string(),
  },
  returns: v.object({ lessonAt: v.number() }),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const settings = await getSettings(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (day === null) throw appError("NOT_FOUND", "Day not found.");
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(args.date);
    if (!dateMatch) throw appError("INVALID", "Pick a lesson date.");
    let clock;
    try {
      clock = parseClockTime(args.time);
    } catch {
      throw appError("INVALID", "Pick a lesson time.");
    }
    const lessonAt = zonedTimeToUtc(
      {
        year: Number(dateMatch[1]),
        month: Number(dateMatch[2]),
        day: Number(dateMatch[3]),
        hour: clock.hour,
        minute: clock.minute,
      },
      settings.timeZone,
    );
    const existing = await ctx.db
      .query("lessonSchedules")
      .withIndex("by_dayId_and_year", (q) => q.eq("dayId", day._id).eq("year", args.year))
      .unique();
    if (existing) {
      await ctx.db.patch("lessonSchedules", existing._id, { lessonAt });
    } else {
      await ctx.db.insert("lessonSchedules", { dayId: day._id, year: args.year, lessonAt });
    }
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "lessonSchedules",
      recordId: day._id,
      summary: `Scheduled Day ${day.order}: ${day.topic} for ${args.year}`,
      before: existing ? { lessonAt: existing.lessonAt } : undefined,
      after: { lessonAt },
    });
    return { lessonAt };
  },
});

/** Edits a day's shared content (all years): topic and slides link. */
export const updateDayContent = mutation({
  args: { dayId: v.id("days"), topic: v.string(), slidesUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (day === null) throw appError("NOT_FOUND", "Day not found.");
    const topic = args.topic.trim();
    const problem = topicProblem(topic);
    if (problem !== null) throw appError("INVALID", problem);
    const slidesUrl = args.slidesUrl.trim();
    if (slidesUrl.length > 0) {
      let url: URL;
      try {
        url = new URL(slidesUrl);
      } catch {
        throw appError("INVALID", "Paste a full link that starts with https://.");
      }
      if (url.protocol !== "https:") throw appError("INVALID", "Slides links must use https://.");
      if (slidesUrl.length > 2000) throw appError("INVALID", "That link is too long.");
    }
    const before = { topic: day.topic, slidesUrl: day.slidesUrl ?? null };
    const after = { topic, slidesUrl: slidesUrl || null };
    if (JSON.stringify(before) === JSON.stringify(after)) return null;
    await ctx.db.patch("days", day._id, { topic, slidesUrl: slidesUrl || undefined });
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "days",
      recordId: day._id,
      summary: `Edited Day ${day.order} content`,
      before,
      after,
    });
    return null;
  },
});

const coverResultValidator = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), message: v.string() }),
);

/** Deletes a stored cover once no day uses it. */
async function deleteUnusedCover(ctx: Pick<MutationCtx, "db" | "storage">, storageId: Id<"_storage">) {
  const user = await ctx.db
    .query("days")
    .withIndex("by_coverImageId", (q) => q.eq("coverImageId", storageId))
    .first();
  if (user !== null) return;
  if ((await ctx.db.system.get("_storage", storageId)) !== null) await ctx.storage.delete(storageId);
}

/** A short-lived URL the admin's browser uploads a cover image to. */
export const generateCoverUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Makes an uploaded image the day's cover (shared by every year) and deletes
 * the cover it replaces. The stored file's type and size are checked here; a
 * refused upload is deleted and the reason returned (a thrown error would
 * roll the delete back).
 */
export const setCover = mutation({
  args: { dayId: v.id("days"), storageId: v.id("_storage") },
  returns: coverResultValidator,
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (day === null) throw appError("NOT_FOUND", "Day not found.");
    if (day.coverImageId === args.storageId) return { ok: true as const };
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (file === null) return { ok: false as const, message: "The upload didn’t finish. Try again." };
    const otherDay = await ctx.db
      .query("days")
      .withIndex("by_coverImageId", (q) => q.eq("coverImageId", args.storageId))
      .first();
    if (otherDay !== null) throw appError("CONFLICT", "That image is already another day’s cover.");
    const problem = coverProblem(file.contentType, file.size);
    if (problem !== null) {
      await ctx.storage.delete(args.storageId);
      return { ok: false as const, message: problem };
    }

    const previous = day.coverImageId;
    await ctx.db.patch("days", day._id, { coverImageId: args.storageId });
    if (previous !== undefined) await deleteUnusedCover(ctx, previous);
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "days",
      recordId: day._id,
      summary: `${previous ? "Replaced" : "Added"} the cover image of Day ${day.order}`,
      before: { cover: previous ? "image" : null },
      after: { cover: `${file.contentType}, ${Math.ceil(file.size / 1000)} KB` },
    });
    return { ok: true as const };
  },
});

/** Removes the day's cover and deletes the stored image. */
export const removeCover = mutation({
  args: { dayId: v.id("days") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (day === null) throw appError("NOT_FOUND", "Day not found.");
    const previous = day.coverImageId;
    if (previous === undefined) return null;
    await ctx.db.patch("days", day._id, { coverImageId: undefined });
    await deleteUnusedCover(ctx, previous);
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "days",
      recordId: day._id,
      summary: `Removed the cover image of Day ${day.order}`,
      before: { cover: "image" },
      after: { cover: null },
    });
    return null;
  },
});

/** Adds an unscheduled day at the end of a curriculum and returns its id. */
export const addDay = mutation({
  args: { curriculumId: v.id("curricula"), topic: v.string() },
  returns: v.id("days"),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const curriculum = await ctx.db.get("curricula", args.curriculumId);
    if (curriculum === null) throw appError("NOT_FOUND", "Curriculum not found.");
    const topic = args.topic.trim();
    const problem = topicProblem(topic);
    if (problem !== null) throw appError("INVALID", problem);
    const days = await curriculumDays(ctx, curriculum._id);
    if (days.length >= MAX_DAYS) {
      throw appError("INVALID", `A curriculum can have at most ${MAX_DAYS} days.`);
    }
    const order = (days.at(-1)?.order ?? 0) + 1;
    const dayId = await ctx.db.insert("days", { curriculumId: curriculum._id, order, topic });
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "days",
      recordId: dayId,
      summary: `Added Day ${order}: ${topic} to ${curriculum.name}`,
      after: { order, topic },
    });
    return dayId;
  },
});

/** Moves a day one place earlier or later; days are renumbered in order. */
export const moveDay = mutation({
  args: { dayId: v.id("days"), direction: v.union(v.literal("up"), v.literal("down")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (day === null) throw appError("NOT_FOUND", "Day not found.");
    const days = await curriculumDays(ctx, day.curriculumId);
    const from = days.findIndex((d) => d._id === day._id);
    const to = args.direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= days.length) return null;
    [days[from], days[to]] = [days[to]!, days[from]!];
    await renumberDays(ctx, days);
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "days",
      recordId: day._id,
      summary: `Moved ${day.topic} from Day ${from + 1} to Day ${to + 1}`,
      before: { order: from + 1 },
      after: { order: to + 1 },
    });
    return null;
  },
});

/**
 * Removes a day with no assignments (so no student work) and no attendance,
 * with its lesson dates and cover. Later days move up one.
 */
export const removeDay = mutation({
  args: { dayId: v.id("days") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (day === null) throw appError("NOT_FOUND", "Day not found.");
    const assignment = await ctx.db
      .query("assignments")
      .withIndex("by_dayId_and_order", (q) => q.eq("dayId", day._id))
      .first();
    if (assignment !== null) {
      throw appError("INVALID", "Only empty days can be removed. Remove this day’s assignments first.");
    }
    const schedules = await ctx.db
      .query("lessonSchedules")
      .withIndex("by_dayId_and_year", (q) => q.eq("dayId", day._id))
      .take(MAX_SCHEDULES_PER_DAY);
    for (const schedule of schedules) {
      const marked = await ctx.db
        .query("attendance")
        .withIndex("by_scheduleId_and_studentId", (q) => q.eq("scheduleId", schedule._id))
        .first();
      if (marked !== null) {
        throw appError("CONFLICT", "Attendance was taken for this day’s lesson, so it can’t be removed.");
      }
    }

    for (const schedule of schedules) await ctx.db.delete("lessonSchedules", schedule._id);
    await ctx.db.delete("days", day._id);
    if (day.coverImageId !== undefined) await deleteUnusedCover(ctx, day.coverImageId);
    await renumberDays(
      ctx,
      (await curriculumDays(ctx, day.curriculumId)).filter((d) => d._id !== day._id),
    );
    const curriculum = await ctx.db.get("curricula", day.curriculumId);
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "days",
      recordId: day._id,
      summary: `Removed Day ${day.order}: ${day.topic} from ${curriculum?.name ?? "its curriculum"}`,
      before: {
        topic: day.topic,
        lessonDates: schedules.length,
        cover: day.coverImageId !== undefined,
      },
    });
    return null;
  },
});
