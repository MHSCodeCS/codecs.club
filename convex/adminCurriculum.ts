import { classFor, classYear, writableCurriculum } from "./lib/classes";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getSettings, requireAdmin } from "./lib/access";
import { recordAdminChange } from "./lib/changes";
import { appError } from "./lib/errors";
import { zonedParts, parseClockTime, zonedTimeToUtc } from "./lib/time";
import { assignmentTypeValidator, groupValidator } from "./schema";

const MAX_DAYS = 100;

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
          v.object({
            _id: v.id("lessonSchedules"),
            lessonAt: v.number(),
            endsAt: v.union(v.number(), v.null()),
          }),
        ),
        assignments: v.array(
          v.object({
            _id: v.id("assignments"),
            title: v.string(),
            type: assignmentTypeValidator,
            status: v.union(v.literal("draft"), v.literal("published")),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const settings = await getSettings(ctx);
    const classroom = await classFor(ctx, args.group);
    const year = classroom?.year ?? args.year ?? settings.currentYear;
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
      const dayDocs = await ctx.db
        .query("days")
        .withIndex("by_curriculumId_and_order", (q) => q.eq("curriculumId", curriculum._id))
        .take(MAX_DAYS);
      for (const day of dayDocs) {
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
          schedule: schedule
            ? {
                _id: schedule._id,
                lessonAt: schedule.lessonAt,
                endsAt: schedule.endsAt ?? null,
              }
            : null,
          assignments: assignments.map((a) => ({
            _id: a._id,
            title: a.title,
            type: a.type,
            status: a.status,
          })),
        });
      }
    }

    return {
      year,
      currentYear: await classYear(ctx, args.group),
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
    endTime: v.optional(v.string()),
  },
  returns: v.object({ lessonAt: v.number() }),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const settings = await getSettings(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (day === null) throw appError("NOT_FOUND", "Day not found.");
    await writableCurriculum(ctx, day.curriculumId);
    const curriculum = await ctx.db.get("curricula", day.curriculumId);
    const classroom = curriculum ? await classFor(ctx, curriculum.group) : null;
    if (classroom && args.year !== classroom.year) throw appError("INVALID", "Choose this class’s assigned year.");
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
    const endsAt = lessonEnd(lessonAt, args.endTime, settings.timeZone);
    const existing = await ctx.db
      .query("lessonSchedules")
      .withIndex("by_dayId_and_year", (q) => q.eq("dayId", day._id).eq("year", args.year))
      .unique();
    if (existing) {
      await ctx.db.patch("lessonSchedules", existing._id, { lessonAt, endsAt });
    } else {
      await ctx.db.insert("lessonSchedules", {
        dayId: day._id,
        year: args.year,
        lessonAt,
        endsAt,
      });
    }
    await recordAdminChange(ctx, {
      actorId: userId,
      table: "lessonSchedules",
      recordId: day._id,
      summary: `Scheduled Day ${day.order}: ${day.topic} for ${args.year}`,
      before: existing
        ? { lessonAt: existing.lessonAt, endsAt: existing.endsAt }
        : undefined,
      after: { lessonAt, endsAt },
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
    await writableCurriculum(ctx, day.curriculumId);
    const topic = args.topic.trim();
    if (topic.length === 0) throw appError("INVALID", "Give the day a topic.");
    const slidesUrl = args.slidesUrl.trim();
    if (slidesUrl.length > 0) {
      let url: URL;
      try {
        url = new URL(slidesUrl);
      } catch {
        throw appError("INVALID", "Paste a full link that starts with https://.");
      }
      if (url.protocol !== "https:") throw appError("INVALID", "Slides links must use https://.");
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

/** Explicitly adds a curriculum day and its current-year lesson for attendance. */
export const addLesson = mutation({
  args: { curriculumId: v.id("curricula"), topic: v.string(), date: v.string(), time: v.string(), endTime: v.optional(v.string()) },
  returns: v.id("lessonSchedules"),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const settings = await getSettings(ctx);
    const curriculum = await ctx.db.get("curricula", args.curriculumId);
    if (!curriculum) throw appError("NOT_FOUND", "Curriculum not found.");
    await writableCurriculum(ctx, curriculum._id);
    const year = await classYear(ctx, curriculum.group);
    const topic = args.topic.trim();
    if (!topic || topic.length > 100) throw appError("INVALID", "Enter a lesson topic of 1–100 characters.");
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(args.date);
    const time = /^(\d{2}):(\d{2})$/.exec(args.time);
    if (!date || !time) throw appError("INVALID", "Choose a valid date and time.");
    const wall = { year: +date[1], month: +date[2], day: +date[3], hour: +time[1], minute: +time[2] };
    const lessonAt = zonedTimeToUtc(wall, settings.timeZone);
    const actual = zonedParts(lessonAt, settings.timeZone);
    if (Object.keys(wall).some(key => wall[key as keyof typeof wall] !== actual[key as keyof typeof actual])) throw appError("INVALID", "Choose a valid date and time in the school time zone.");
    const endsAt = lessonEnd(lessonAt, args.endTime, settings.timeZone);
    const existingDays = await ctx.db.query("days").withIndex("by_curriculumId_and_order", q => q.eq("curriculumId", args.curriculumId)).take(MAX_DAYS);
    if (existingDays.length >= MAX_DAYS) throw appError("INVALID", "A class supports up to 100 lessons.");
    const latest = await ctx.db.query("days").withIndex("by_curriculumId_and_order", q => q.eq("curriculumId", args.curriculumId)).order("desc").first();
    const dayId = await ctx.db.insert("days", { curriculumId: args.curriculumId, topic, order: (latest?.order ?? 0) + 1 });
    const scheduleId = await ctx.db.insert("lessonSchedules", { dayId, year, lessonAt, endsAt });
    await recordAdminChange(ctx, { actorId: userId, table: "days", recordId: dayId, summary: `Added lesson: ${topic}`, after: { curriculumId: args.curriculumId, topic } });
    await recordAdminChange(ctx, { actorId: userId, table: "lessonSchedules", recordId: scheduleId, summary: `Scheduled ${topic}`, after: { dayId, year, lessonAt, endsAt } });
    return scheduleId;
  },
});

/** End times are on the lesson date in the school's time zone. */
function lessonEnd(start: number, endTime: string | undefined, timeZone: string): number | undefined {
  if (endTime === undefined) return undefined;
  const match = /^(\d{2}):(\d{2})$/.exec(endTime);
  if (!match || +match[1] > 23 || +match[2] > 59) throw appError("INVALID", "Choose a valid end time.");
  const day = zonedParts(start, timeZone);
  const wall = { ...day, hour: +match[1], minute: +match[2] };
  const end = zonedTimeToUtc(wall, timeZone);
  const actual = zonedParts(end, timeZone);
  if (actual.hour !== wall.hour || actual.minute !== wall.minute || end <= start) throw appError("INVALID", "End time must be after the start time on the same date.");
  return end;
}

export const coverUploadUrl = mutation({
  args: {}, returns: v.string(),
  handler: async ctx => { await requireAdmin(ctx); return await ctx.storage.generateUploadUrl(); },
});

export const setCover = mutation({
  args: { dayId: v.id("days"), storageId: v.union(v.id("_storage"), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (!day) throw appError("NOT_FOUND", "Lesson not found.");
    await writableCurriculum(ctx, day.curriculumId);
    if (args.storageId) {
      const file = await ctx.db.system.get("_storage", args.storageId);
      if (!file || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.contentType ?? "") || file.size > 5_000_000) throw appError("INVALID", "Use a PNG, JPEG, WebP or GIF image up to 5 MB.");
    }
    if ((day.coverImageId ?? null) === args.storageId) return null;
    await ctx.db.patch("days", day._id, { coverImageId: args.storageId ?? undefined });
    await recordAdminChange(ctx, { actorId: userId, table: "days", recordId: day._id, summary: `${args.storageId ? "Updated" : "Removed"} Day ${day.order} cover`, before: { coverImageId: day.coverImageId ?? null }, after: { coverImageId: args.storageId } });
    return null;
  },
});

/** Copy selected lessons; no dates, attendance, work, or published state is shared. */
export const importLessons = mutation({
  args: { group: v.string(), sourceGroup: v.string(), dayIds: v.array(v.id("days")) },
  returns: v.object({ imported: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const target = await classFor(ctx, args.group);
    if (!target) throw appError("NOT_FOUND", "Destination class not found.");
    if (target.status === "archived") throw appError("FORBIDDEN", "This class is archived and read-only.");
    if (args.sourceGroup === args.group) throw appError("INVALID", "Choose a different source class.");
    if (!await classFor(ctx, args.sourceGroup)) throw appError("NOT_FOUND", "Source class not found.");
    const ids = [...new Set(args.dayIds)];
    if (!ids.length || ids.length > 10) throw appError("INVALID", "Import 1–10 lessons at a time.");
    const curriculum = await ctx.db.query("curricula").withIndex("by_group", q => q.eq("group", args.group)).order("desc").first();
    if (!curriculum) throw appError("NOT_FOUND", "Destination class is not ready.");
    const existingDays = await ctx.db.query("days").withIndex("by_curriculumId_and_order", q => q.eq("curriculumId", curriculum._id)).take(101);
    const sources = [];
    for (const id of ids) {
      const day = await ctx.db.get("days", id);
      const owner = day ? await ctx.db.get("curricula", day.curriculumId) : null;
      if (!day || owner?.group !== args.sourceGroup) throw appError("INVALID", "Every lesson must belong to the source class.");
      sources.push(day);
    }
    sources.sort((a, b) => a.order - b.order);
    let order = Math.max(0, ...existingDays.map(d => d.order)), imported = 0, skipped = 0;
    for (const source of sources) {
      const existing = await ctx.db.query("days").withIndex("by_curriculumId_and_importedFromDayId", q => q.eq("curriculumId", curriculum._id).eq("importedFromDayId", source._id)).first();
      if (existing) { skipped++; continue; }
      if (existingDays.length + imported >= MAX_DAYS) throw appError("INVALID", "A class supports up to 100 lessons.");
      const dayId = await ctx.db.insert("days", { curriculumId: curriculum._id, importedFromDayId: source._id, order: ++order, topic: source.topic, slidesUrl: source.slidesUrl, coverImageId: source.coverImageId });
      const assignments = await ctx.db.query("assignments").withIndex("by_dayId_and_order", q => q.eq("dayId", source._id)).take(51);
      if (assignments.length > 50) throw appError("INVALID", "A lesson supports up to 50 assignments.");
      for (const assignment of assignments) {
        const sourceRevisionId = assignment.currentRevisionId ?? assignment.publishedRevisionId;
        const revision = sourceRevisionId ? await ctx.db.get("assignmentRevisions", sourceRevisionId) : null;
        const assignmentId = await ctx.db.insert("assignments", { dayId, order: assignment.order, title: revision?.title ?? assignment.title, type: revision?.type ?? assignment.type, status: "draft" });
        if (revision) {
          const { _id, _creationTime, ...content } = revision;
          void _id; void _creationTime;
          const revisionId = await ctx.db.insert("assignmentRevisions", { ...content, assignmentId, createdBy: userId, createdAt: Date.now() });
          await ctx.db.patch("assignments", assignmentId, { currentRevisionId: revisionId });
        }
      }
      await recordAdminChange(ctx, { actorId: userId, table: "days", recordId: dayId, summary: `Imported lesson ${source.topic} into ${target.name}`, after: { importedFromDayId: source._id } });
      imported++;
    }
    return { imported, skipped };
  },
});

/** Delete unused curriculum content; student work, attendance and audit history are never cascaded. */
export const deleteDay = mutation({
  args: { dayId: v.id("days") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const day = await ctx.db.get("days", args.dayId);
    if (!day) throw appError("NOT_FOUND", "Day no longer exists.");
    await writableCurriculum(ctx, day.curriculumId);
    const assignments = await ctx.db.query("assignments").withIndex("by_dayId_and_order", q => q.eq("dayId", day._id)).take(51);
    if (assignments.length > 50) throw appError("INVALID", "This day has too many assignments to delete at once.");
    const schedules = await ctx.db.query("lessonSchedules").withIndex("by_dayId_and_year", q => q.eq("dayId", day._id)).take(101);
    if (schedules.length > 100) throw appError("INVALID", "This day has too many schedules to delete at once.");
    for (const assignment of assignments) {
      const work = await ctx.db.query("workspaces").withIndex("by_assignmentId", q => q.eq("assignmentId", assignment._id)).first();
      if (work) throw appError("CONFLICT", "This day has saved student work and cannot be deleted.");
    }
    for (const schedule of schedules) {
      const attendance = await ctx.db.query("attendance").withIndex("by_scheduleId_and_studentId", q => q.eq("scheduleId", schedule._id)).first();
      if (attendance) throw appError("CONFLICT", "This day has attendance records and cannot be deleted.");
    }
    for (const assignment of assignments) {
      for await (const revision of ctx.db.query("assignmentRevisions").withIndex("by_assignmentId", q => q.eq("assignmentId", assignment._id))) {
        await ctx.db.delete("assignmentRevisions", revision._id);
      }
      await ctx.db.delete("assignments", assignment._id);
    }
    for (const schedule of schedules) await ctx.db.delete("lessonSchedules", schedule._id);
    await ctx.db.delete("days", day._id);
    await recordAdminChange(ctx, { actorId: userId, table: "days", recordId: day._id,
      summary: `Deleted Day ${day.order}: ${day.topic}`,
      before: { topic: day.topic, order: day.order, curriculumId: day.curriculumId, assignments: assignments.map(a => ({ id: a._id, title: a.title })), schedules: schedules.map(s => ({ id: s._id, year: s.year, lessonAt: s.lessonAt })) } });
    return null;
  },
});
