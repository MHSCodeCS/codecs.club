import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getSettings } from "./access";
import { appError } from "./errors";
type Ctx = Pick<QueryCtx, "db">;
export async function classFor(ctx: Ctx, group: string) {
  return await ctx.db.query("classes").withIndex("by_group", q => q.eq("group", group)).unique();
}
export async function classYear(ctx: Ctx, group: string) {
  return (await classFor(ctx, group))?.year ?? (await getSettings(ctx)).currentYear;
}
export async function writableClass(ctx: Ctx, group: string) {
  const classroom = await classFor(ctx, group);
  if (classroom?.status === "archived") throw appError("FORBIDDEN", "This class is archived and read-only.");
  return classroom;
}
export async function writableCurriculum(ctx: Ctx, curriculumId: Doc<"curricula">["_id"]) {
  const curriculum = await ctx.db.get("curricula", curriculumId);
  if (curriculum) await writableClass(ctx, curriculum.group);
}
export async function rememberEnrollment(ctx: MutationCtx, student: Doc<"students">) {
  const existing = await ctx.db.query("enrollments").withIndex("by_studentId_and_group", q => q.eq("studentId", student._id).eq("group", student.group)).unique();
  if (existing && existing.curriculumId !== student.curriculumId && (await classFor(ctx, student.group))?.status !== "archived") await ctx.db.patch("enrollments", existing._id, { curriculumId: student.curriculumId });
  if (!existing) {
    await requireEnrollmentSpace(ctx, student.group);
    await ctx.db.insert("enrollments", { studentId: student._id, group: student.group, year: await classYear(ctx, student.group), curriculumId: student.curriculumId });
  }
}

export async function requireEnrollmentSpace(ctx: Ctx, group: string) {
  const entries = await ctx.db.query("enrollments").withIndex("by_group", q => q.eq("group", group)).take(500);
  if (entries.length >= 500) throw appError("INVALID", "A class supports up to 500 students.");
}

/** Apply the same enrollment/placement transition for edits and CSV imports. */
export async function transitionEnrollment(ctx: MutationCtx, student: Doc<"students">, group: string, curriculumId: Doc<"curricula">["_id"]) {
  const target = await writableClass(ctx, group);
  await rememberEnrollment(ctx, student);
  const upcoming = target?.status === "upcoming" && student.group !== group;
  const year = await classYear(ctx, group);
  if (!upcoming && student.group !== group && (await classFor(ctx, student.group))?.year === year) {
    const source = await ctx.db.query("enrollments").withIndex("by_studentId_and_group", q => q.eq("studentId", student._id).eq("group", student.group)).unique();
    if (source) await ctx.db.delete("enrollments", source._id);
  }
  const destination = await ctx.db.query("enrollments").withIndex("by_studentId_and_group", q => q.eq("studentId", student._id).eq("group", group)).unique();
  if (destination) await ctx.db.patch("enrollments", destination._id, { curriculumId, year });
  else {
    await requireEnrollmentSpace(ctx, group);
    await ctx.db.insert("enrollments", { studentId: student._id, group, curriculumId, year });
  }
  const placement = upcoming ? { group: student.group, curriculumId: student.curriculumId } : { group, curriculumId };
  const seatIndex = !upcoming && student.group !== group ? undefined : student.seatIndex;
  await ctx.db.patch("students", student._id, { ...placement, seatIndex });
  return { ...placement, seatIndex };
}
