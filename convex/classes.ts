import { normalizeLoginCode } from "./lib/loginCodes";
import { api } from "./_generated/api";
import { v } from "convex/values";
import schema from "./schema";
import { mutation, query } from "./_generated/server";
import { requireAdmin, getSettings } from "./lib/access";
import { classFor, rememberEnrollment, writableClass, requireEnrollmentSpace } from "./lib/classes";
import { appError } from "./lib/errors";
import { recordAdminChange } from "./lib/changes";

export const list = query({ args: {}, returns: v.array(schema.doc("classes")), handler: async ctx => {
  await requireAdmin(ctx); return await ctx.db.query("classes").withIndex("by_deletedAt", q => q.eq("deletedAt", undefined)).take(500);
} });
/** Explicit, idempotent adoption of the original groups and their rosters. */
export const initialize = mutation({ args: {}, returns: v.null(), handler: async ctx => {
  await requireAdmin(ctx);
  const settings = await getSettings(ctx);
  for (const group of ["basic", "advanced"]) {
    if (await classFor(ctx, group)) continue;
    await ctx.db.insert("classes", { name: group === "basic" ? "Basic" : "Advanced", group, year: settings.currentYear, status: "current" });
    const students = await ctx.db.query("students").withIndex("by_group_and_deletedAt_and_lastName", q => q.eq("group", group).eq("deletedAt", undefined)).take(501);
    if (students.length > 500) throw appError("INVALID", "Migrate this roster in batches before initializing classes.");
    for (const student of students) await rememberEnrollment(ctx, student);
  }
  return null;
} });
export const create = mutation({ args: { name: v.string(), year: v.string(), upcoming: v.boolean() }, returns: v.id("classes"), handler: async (ctx, args) => {
  const { userId } = await requireAdmin(ctx);
  const name = args.name.trim(), year = args.year.trim();
  if (!name || name.length > 100) throw appError("INVALID", "Enter a class name of 1–100 characters.");
  if (!/^\d{4}(-\d{2})?$/.test(year) || (year.includes("-") && +year.slice(-2) !== (+year.slice(0,4)+1)%100)) throw appError("INVALID", "Enter a year such as 2027 or 2027-28.");
  if ((await ctx.db.query("classes").withIndex("by_deletedAt", q => q.eq("deletedAt", undefined)).take(500)).length >= 500) throw appError("INVALID", "Class limit reached.");
  const id = await ctx.db.insert("classes", { name, year, group: "pending", status: args.upcoming ? "upcoming" : "current" });
  await ctx.db.patch("classes", id, { group: id });
  await ctx.db.insert("curricula", { name: `${name} curriculum`, group: id });
  await recordAdminChange(ctx, { actorId: userId, table: "classes", recordId: id, summary: `Created class ${name} (${year})` });
  return id;
} });
export const setStatus = mutation({ args: { classId: v.id("classes"), status: v.union(v.literal("current"), v.literal("archived")) }, returns: v.null(), handler: async (ctx, args) => {
  const { userId } = await requireAdmin(ctx);
  const classroom = await ctx.db.get("classes", args.classId);
  if (!classroom) throw appError("NOT_FOUND", "Class not found.");
  await writableClass(ctx, classroom.group);
  if (args.status === "current" && classroom.status !== "upcoming") throw appError("INVALID", "Only upcoming classes can be started.");
  const enrolled = await ctx.db.query("enrollments").withIndex("by_group", q => q.eq("group", classroom.group)).take(501);
  if (enrolled.length > 500) throw appError("INVALID", "Class roster limit exceeded.");
  if (args.status === "current") for (const entry of enrolled) {
    const student = await ctx.db.get("students", entry.studentId);
    if (!student || student.deletedAt !== undefined) continue;
    await rememberEnrollment(ctx, student);
    await ctx.db.patch("students", student._id, { group: classroom.group, curriculumId: entry.curriculumId, seatIndex: undefined });
  }
  await ctx.db.patch("classes", classroom._id, { status: args.status });
  await recordAdminChange(ctx, { actorId: userId, table: "classes", recordId: classroom._id, summary: `${args.status === "archived" ? "Archived" : "Started"} class ${classroom.name}` });
  return null;
} });
export const enroll = mutation({ args: { studentId: v.id("students"), group: v.string(), restore: v.optional(v.boolean()) }, returns: v.null(), handler: async (ctx, args) => {
  const { userId } = await requireAdmin(ctx);
  const classroom = await writableClass(ctx, args.group);
  if (!classroom) throw appError("NOT_FOUND", "Class not found.");
  const student = await ctx.db.get("students", args.studentId);
  if (!student) throw appError("NOT_FOUND", "Student not found.");
  if (student.deletedAt !== undefined && !args.restore) throw appError("INVALID", "Choose Restore and add to re-enroll this removed student.");
  const curriculum = await ctx.db.query("curricula").withIndex("by_group", q => q.eq("group", args.group)).order("desc").first();
  if (!curriculum) throw appError("NOT_FOUND", "Class curriculum missing.");
  if (student.deletedAt !== undefined) await ctx.db.patch("students", student._id, { deletedAt: undefined, seatIndex: undefined });
  await rememberEnrollment(ctx, student);
  const existing = await ctx.db.query("enrollments").withIndex("by_studentId_and_group", q => q.eq("studentId", student._id).eq("group", args.group)).unique();
  if (!existing) { await requireEnrollmentSpace(ctx, args.group); await ctx.db.insert("enrollments", { studentId: student._id, group: args.group, year: classroom.year, curriculumId: curriculum._id }); }
  if (classroom.status === "current" && student.group !== args.group) {
    const previous = await classFor(ctx, student.group);
    if (previous?.status !== "archived" && previous?.year === classroom.year) {
      const old = await ctx.db.query("enrollments").withIndex("by_studentId_and_group", q => q.eq("studentId", student._id).eq("group", student.group)).unique();
      if (old) await ctx.db.delete("enrollments", old._id);
    }
  }
  if (classroom.status === "current") await ctx.db.patch("students", student._id, { group: args.group, curriculumId: curriculum._id, seatIndex: undefined });
  await recordAdminChange(ctx, { actorId: userId, table: "enrollments", recordId: student._id, summary: `Enrolled ${student.firstName} ${student.lastName} in ${classroom.name} (${classroom.year})` });
  return null;
} });
export const studentHistory = query({ args: { studentId: v.id("students") }, returns: v.array(v.object({ group: v.string(), name: v.string(), year: v.string(), status: v.string() })), handler: async (ctx, args) => {
  await requireAdmin(ctx);
  const rows = await ctx.db.query("enrollments").withIndex("by_studentId", q => q.eq("studentId", args.studentId)).take(100);
  return await Promise.all(rows.map(async row => { const c = await classFor(ctx, row.group); return { group: row.group, name: c?.name ?? row.group, year: row.year, status: c?.status ?? "current" }; }));
} });

/** Enroll a returning student without creating another identity or login. */
export const enrollByCode = mutation({ args: { loginCode: v.string(), group: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  await requireAdmin(ctx);
  const student = await ctx.db.query("students").withIndex("by_loginCode", q => q.eq("loginCode", normalizeLoginCode(args.loginCode))).unique();
  if (!student || student.deletedAt !== undefined) throw appError("NOT_FOUND", "No active student has this login code.");
  await ctx.runMutation(api.classes.enroll, { studentId: student._id, group: args.group });
  return null;
} });

/** Search persistent identities, including removed students and archived classes. */
export const findStudents = query({
  args: { search: v.string(), group: v.string() },
  returns: v.array(v.object({ _id: v.id("students"), firstName: v.string(), lastName: v.string(), loginCode: v.string(), sinceYear: v.string(), previousClass: v.string(), removed: v.boolean(), enrolled: v.boolean() })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const search = args.search.trim().slice(0, 100);
    if (search.length < 2) return [];
    const terms = search.toLowerCase().split(/\s+/);
    const [first, last, code] = await Promise.all([
      ctx.db.query("students").withSearchIndex("search_firstName", q => q.search("firstName", terms[0])).take(50),
      ctx.db.query("students").withSearchIndex("search_lastName", q => q.search("lastName", terms.at(-1)!)).take(50),
      ctx.db.query("students").withIndex("by_loginCode", q => q.eq("loginCode", normalizeLoginCode(search))).first(),
    ]);
    const people = [...new Map([...first, ...last, ...(code ? [code] : [])].map(s => [s._id, s])).values()];
    const matches = people.filter(s => s === code || terms.every(term => `${s.firstName} ${s.lastName}`.toLowerCase().split(/\s+/).some(word => word.startsWith(term)))).slice(0, 50);
    return await Promise.all(matches.map(async student => {
      const classroom = await classFor(ctx, student.group);
      const enrollment = await ctx.db.query("enrollments").withIndex("by_studentId_and_group", q => q.eq("studentId", student._id).eq("group", args.group)).unique();
      return { _id: student._id, firstName: student.firstName, lastName: student.lastName, loginCode: student.loginCode, sinceYear: student.sinceYear, previousClass: classroom ? `${classroom.name} · ${classroom.year}` : student.group, removed: student.deletedAt !== undefined, enrolled: !!enrollment && student.deletedAt === undefined };
    }));
  },
});


/** Remove an archive from class lists without erasing student history or work. */
export const deleteArchived = mutation({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) throw appError("NOT_FOUND", "Class not found.");
    if (classroom.status !== "archived") throw appError("INVALID", "Only archived classes can be deleted.");
    if (classroom.deletedAt !== undefined) return null;
    const deletedAt = Date.now();
    await ctx.db.patch("classes", classroom._id, { deletedAt });
    await recordAdminChange(ctx, { actorId: userId, table: "classes", recordId: classroom._id, summary: `Deleted archived class ${classroom.name} (${classroom.year})`, after: { deletedAt } });
    return null;
  },
});
