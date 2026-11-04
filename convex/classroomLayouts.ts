import { writableClass } from "./lib/classes";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { deskValidator, groupValidator } from "./schema";
import { requireAdmin } from "./lib/access";
import { appError } from "./lib/errors";
import { recordAdminChange } from "./lib/changes";
import { defaultDesks } from "../lib/classroomLayout";

const placement = v.object({ studentId: v.id("students"), seat: v.union(v.number(), v.null()) });
function fingerprint(students: { _id: string; seatIndex?: number }[]) {
  return JSON.stringify(students.map(s => [s._id, s.seatIndex ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}
export const get = query({
  args: { group: groupValidator },
  returns: v.object({ revision: v.number(), desks: v.array(deskValidator), seating: v.array(placement), fingerprint: v.string() }),
  handler: async (ctx, { group }) => {
    await requireAdmin(ctx);
    const layout = await ctx.db.query("classroomLayouts").withIndex("by_group", q => q.eq("group", group)).unique();
    const students = await ctx.db.query("students").withIndex("by_group_and_deletedAt_and_lastName", q => q.eq("group", group).eq("deletedAt", undefined)).take(501);
    if (students.length > 500) throw appError("INVALID", "Classroom supports up to 500 students.");
    return { revision: layout?.revision ?? 0, desks: layout?.desks ?? defaultDesks(Math.max(23, ...students.map(s => s.seatIndex ?? -1))), seating: students.map(s => ({ studentId: s._id, seat: s.seatIndex ?? null })), fingerprint: fingerprint(students) };
  },
});
export const save = mutation({
  args: { group: groupValidator, revision: v.number(), fingerprint: v.string(), desks: v.array(deskValidator), seating: v.array(placement) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId: actorId } = await requireAdmin(ctx);
    await writableClass(ctx, args.group);
    const layout = await ctx.db.query("classroomLayouts").withIndex("by_group", q => q.eq("group", args.group)).unique();
    const students = await ctx.db.query("students").withIndex("by_group_and_deletedAt_and_lastName", q => q.eq("group", args.group).eq("deletedAt", undefined)).take(501);
    if ((layout?.revision ?? 0) !== args.revision || fingerprint(students) !== args.fingerprint) throw appError("CONFLICT", "The classroom changed while you were editing. Cancel and reopen edit mode to load the latest layout.");
    const seats = new Set<number>();
    if (args.desks.length > 60) throw appError("INVALID", "Use up to 60 desks.");
    for (const d of args.desks) {
      if (!Number.isInteger(d.seat) || d.seat < 0 || d.seat >= 60 || seats.has(d.seat) || ![0, 90, 180, 270].includes(d.rotation) || !Number.isFinite(d.x) || !Number.isFinite(d.y) || Math.abs(d.x) > 5000 || Math.abs(d.y) > 5000) throw appError("INVALID", "Invalid desk position, rotation or number.");
      seats.add(d.seat);
    }
    const byId = new Map(students.map(s => [s._id, s]));
    const seen = new Set<string>(), occupied = new Set<number>();
    if (students.length > 500 || args.seating.length !== students.length) throw appError("INVALID", "Include every student in this group exactly once.");
    for (const p of args.seating) {
      if (!byId.has(p.studentId) || seen.has(p.studentId) || (p.seat !== null && (!seats.has(p.seat) || occupied.has(p.seat)))) throw appError("INVALID", "Students must belong to this group and each desk can have one student.");
      seen.add(p.studentId);
      if (p.seat !== null) occupied.add(p.seat);
    }
    for (const p of args.seating) {
      const student = byId.get(p.studentId)!;
      if ((student.seatIndex ?? null) !== p.seat) {
        await ctx.db.patch("students", p.studentId, { seatIndex: p.seat ?? undefined });
        await recordAdminChange(ctx, { actorId, table: "students", recordId: p.studentId, summary: "Changed classroom seat", before: { seatIndex: student.seatIndex ?? null }, after: { seatIndex: p.seat } });
      }
    }
    const next = { group: args.group, revision: args.revision + 1, desks: args.desks };
    const id = layout ? (await ctx.db.patch("classroomLayouts", layout._id, next), layout._id) : await ctx.db.insert("classroomLayouts", next);
    await recordAdminChange(ctx, { actorId, table: "classroomLayouts", recordId: id, summary: "Saved classroom layout", before: { desks: layout?.desks ?? null }, after: { desks: args.desks } });
    return null;
  },
});
