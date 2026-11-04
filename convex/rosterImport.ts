import { classYear, writableClass, transitionEnrollment, requireEnrollmentSpace } from "./lib/classes";
import { v } from "convex/values";
import { query, mutation, type QueryCtx } from "./_generated/server";
import { groupValidator } from "./schema";
import { requireAdmin } from "./lib/access";
import { allocateLoginCode, normalizeLoginCode } from "./lib/loginCodes";
import { recordAdminChange } from "./lib/changes";
import { appError } from "./lib/errors";
import { avatarColors } from "./lib/studentAvatars";
import type { Infer } from "convex/values";

const rowValidator = v.object({ firstName: v.string(), lastName: v.string(), loginCode: v.string(), mode: v.union(v.literal("new"), v.literal("returning")) });
const importArgs = { group: groupValidator, curriculumId: v.id("curricula"), rows: v.array(rowValidator) };
const resultRow = v.object({ firstName: v.string(), lastName: v.string(), loginCode: v.string(), studentId: v.union(v.id("students"), v.null()), before: v.union(v.string(), v.null()), error: v.union(v.string(), v.null()), warning: v.union(v.string(), v.null()) });
const previewValidator = v.object({ rows: v.array(resultRow), fingerprint: v.string(), valid: v.boolean() });
type Input = Infer<typeof rowValidator>;
type Result = Infer<typeof resultRow>;

async function plan(ctx: QueryCtx, args: { group: string; curriculumId: import("./_generated/dataModel").Id<"curricula">; rows: Input[] }) {
  const curriculum = await ctx.db.get("curricula", args.curriculumId);
  if (!curriculum || curriculum.group !== args.group) throw appError("INVALID", "Choose a curriculum in the target group.");
  if (!args.rows.length || args.rows.length > 100) throw appError("INVALID", "Import 1–100 students at a time.");
  const reserved = new Set<string>();
  const matched = new Set<string>();
  const rows: Result[] = [];
  for (const input of args.rows) {
    const row: Result = { firstName: input.firstName.trim(), lastName: input.lastName.trim(), loginCode: normalizeLoginCode(input.loginCode), studentId: null, before: null, error: null, warning: null };
    if (!row.firstName || !row.lastName || row.firstName.length > 100 || row.lastName.length > 100 || input.loginCode.length > 100) {
      row.error = "First and last names are required (at most 100 characters); codes must be at most 100 characters.";
    } else if (input.mode === "returning") {
      const student = row.loginCode ? await ctx.db.query("students").withIndex("by_loginCode", q => q.eq("loginCode", row.loginCode)).unique() : null;
      if (!student || student.deletedAt !== undefined) row.error = "Existing login code not found. Correct it or explicitly mark this as a new student.";
      else if (matched.has(student._id)) row.error = "This student appears more than once in the import.";
      else {
        matched.add(student._id);
        row.studentId = student._id;
        row.before = JSON.stringify({ firstName: student.firstName, lastName: student.lastName, loginCode: student.loginCode, group: student.group, curriculumId: student.curriculumId });
        const previous = await ctx.db.get("curricula", student.curriculumId);
        row.warning = `Existing: ${student.firstName} ${student.lastName} · ${student.group} · ${previous?.name ?? "Unknown curriculum"}. Keep identity and work; apply the previewed name and assignment.`;
      }
    } else if (input.loginCode.trim()) {
      row.error = "New students must have an empty existing-code field. Codes are allocated automatically.";
    } else {
      const sameName = await ctx.db.query("students").withIndex("by_firstName_and_lastName", q => q.eq("firstName", row.firstName).eq("lastName", row.lastName)).first();
      if (sameName || args.rows.some(other => other !== input && other.firstName.trim() === row.firstName && other.lastName.trim() === row.lastName)) row.warning = "Same name appears elsewhere. This creates a separate identity; use the existing code for a returning student.";
      try { row.loginCode = await allocateLoginCode(ctx, row.firstName, row.lastName, reserved); reserved.add(row.loginCode); }
      catch { row.error = "Cannot allocate a code. Names must contain a Latin letter; contact an admin if needed."; }
    }
    rows.push(row);
  }
  return { rows, valid: rows.every(row => !row.error), fingerprint: JSON.stringify({ rows, group: args.group, curriculumId: args.curriculumId, year: await classYear(ctx, args.group) }) };
}

export const preview = query({
  args: importArgs, returns: previewValidator,
  handler: async (ctx, args) => { await requireAdmin(ctx); return plan(ctx, args); },
});

export const commit = mutation({
  args: { ...importArgs, fingerprint: v.string(), key: v.string() },
  returns: v.array(v.id("students")),
  handler: async (ctx, args) => {
    const { userId: actorId } = await requireAdmin(ctx);
    await writableClass(ctx, args.group);
    if (!args.key || args.key.length > 100) throw appError("INVALID", "Invalid import retry key.");
    const payload = JSON.stringify({ group: args.group, curriculumId: args.curriculumId, rows: args.rows, fingerprint: args.fingerprint });
    const receipt = await ctx.db.query("rosterImports").withIndex("by_actorId_and_key", q => q.eq("actorId", actorId).eq("key", args.key)).unique();
    if (receipt) {
      if (receipt.payload !== payload) throw appError("CONFLICT", "This retry key belongs to another import.");
      return receipt.studentIds;
    }
    const preview = await plan(ctx, args);
    if (!preview.valid) throw appError("INVALID", "Correct the errors in the preview first.");
    if (preview.fingerprint !== args.fingerprint) throw appError("CONFLICT", "The roster changed. Review a fresh preview before importing.");
      const studentIds = [];
    for (const row of preview.rows) {
      const fields = { firstName: row.firstName, lastName: row.lastName, loginCode: row.loginCode, group: args.group, curriculumId: args.curriculumId };
      let id = row.studentId;
      if (id) {
        if (row.before !== JSON.stringify(fields)) {
          const student = (await ctx.db.get("students", id))!;
          const placement = await transitionEnrollment(ctx, student, args.group, args.curriculumId);
          await ctx.db.patch("students", id, { firstName: row.firstName, lastName: row.lastName, loginCode: row.loginCode });
          await ctx.db.patch("users", student.userId, { name: `${row.firstName} ${row.lastName}` });
          await recordAdminChange(ctx, { actorId, table: "students", recordId: id, summary: `Roster import updated ${row.firstName} ${row.lastName}`, before: { ...JSON.parse(row.before!), seatIndex: student.seatIndex ?? null }, after: { ...fields, ...placement, seatIndex: placement.seatIndex ?? null } });
        }
      } else {
        const userId = await ctx.db.insert("users", { name: `${row.firstName} ${row.lastName}`, role: "student" });
        const after = { ...fields, sinceYear: await classYear(ctx, args.group), avatarColor: avatarColors[Math.floor(Math.random() * avatarColors.length)] };
        id = await ctx.db.insert("students", { ...after, userId });
        await recordAdminChange(ctx, { actorId, table: "students", recordId: id, summary: `Roster import added ${row.firstName} ${row.lastName}`, after });
      }
      const existingEnrollment = await ctx.db.query("enrollments").withIndex("by_studentId_and_group", q => q.eq("studentId", id!).eq("group", args.group)).unique();
      if (existingEnrollment) await ctx.db.patch("enrollments", existingEnrollment._id, { curriculumId: args.curriculumId });
      if (!existingEnrollment) { await requireEnrollmentSpace(ctx, args.group); await ctx.db.insert("enrollments", { studentId: id, group: args.group, curriculumId: args.curriculumId, year: await classYear(ctx, args.group) }); }
      studentIds.push(id);
    }
    await ctx.db.insert("rosterImports", { actorId, key: args.key, payload, studentIds });
    return studentIds;
  },
});
