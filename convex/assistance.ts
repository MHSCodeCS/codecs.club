import { firstName } from "./lib/adminNames";
import { classYear, writableClass } from "./lib/classes";
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import schema, { groupValidator } from "./schema";
import { getSettings, requireAdmin, requireStudent } from "./lib/access";
import { workspaceViewer } from "./lib/assistanceAccess";
import { appError } from "./lib/errors";
import { recordAdminChange } from "./lib/changes";
import { workingFiles } from "./workspaces";
import { sameFiles } from "./lib/workFiles";
import { sharedBytes, sharedDocument } from "./lib/sharedText";
import { roomPresence } from "./presence";

const person = v.object({ userId: v.string(), online: v.boolean(), lastDisconnected: v.number() });
const cursorValidator = v.object({ userId: v.string(), name: v.string(), role: v.string(), file: v.union(v.string(), v.null()), anchor: v.union(v.string(), v.null()), head: v.union(v.string(), v.null()) });

export const classroom = query({
  args: { group: groupValidator },
  returns: v.object({ year: v.string(), online: v.array(person), active: v.array(person), focused: v.array(person), students: v.array(v.object({ student: schema.doc("students"), workspaceId: v.union(v.id("workspaces"), v.null()), task: v.union(v.string(), v.null()) })), help: v.array(v.object({ id: v.id("helpRequests"), workspaceId: v.id("workspaces"), studentId: v.id("students"), name: v.string(), task: v.string(), createdAt: v.number() })) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const students = await ctx.db.query("students").withIndex("by_group_and_deletedAt_and_lastName", q => q.eq("group", args.group).eq("deletedAt", undefined)).take(500);
    const online = await roomPresence.listRoom(ctx, `group:${args.group}`, false, 1000);
    const focused = await roomPresence.listRoom(ctx, `focused:${args.group}`, true, 1000);
    const active = await roomPresence.listRoom(ctx, `active:${args.group}`, true, 1000);
    const people = [];
    for (const student of students) {
      let work = await ctx.db.query("workspaces").withIndex("by_studentId_and_updatedAt", q => q.eq("studentId", student._id)).order("desc").first();
      const rooms = await roomPresence.listUser(ctx, student.userId, true, 100);
      for (const room of rooms) {
        if (!room.roomId.startsWith("workspace:")) continue;
        const id = ctx.db.normalizeId("workspaces", room.roomId.slice("workspace:".length));
        const open = id ? await ctx.db.get("workspaces", id) : null;
        if (open?.studentId === student._id) { work = open; break; }
      }
      if (work && work.group !== args.group) work = null;
      const assignment = work ? await ctx.db.get("assignments", work.assignmentId) : null;
      people.push({ student, workspaceId: work?._id ?? null, task: assignment?.title ?? null });
    }
    const requests = await ctx.db.query("helpRequests").withIndex("by_status_and_createdAt", q => q.eq("status", "open")).take(1000);
    const byId = new Map(students.map(s => [s._id, s]));
    const help = [];
    for (const request of requests) {
      const student = byId.get(request.studentId);
      if (!student) continue;
      const work = await ctx.db.get("workspaces", request.workspaceId);
      if (work?.group !== args.group) continue;
      const task = work ? await ctx.db.get("assignments", work.assignmentId) : null;
      help.push({ id: request._id, workspaceId: request.workspaceId, studentId: student._id, name: `${student.firstName} ${student.lastName}`, task: task?.title ?? "Assignment", createdAt: request.createdAt });
    }
    return { year: await classYear(ctx, args.group), online, active, focused, students: people, help };
  },
});

export const detail = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({ timeZone: v.string(), curriculumName: v.string(), workspace: schema.doc("workspaces"), student: schema.doc("students"), task: v.string(), topic: v.string(), files: v.array(v.object({ name: v.string(), content: v.string(), revision: v.number(), sharedState: v.bytes() })), events: v.array(schema.doc("assistEvents")), notes: v.array(v.object({ id: v.id("guidanceNotes"), body: v.string(), name: v.string(), at: v.number() })), cursors: v.array(cursorValidator), sessions: v.array(schema.doc("assistSessions")), joined: v.boolean(), helpId: v.union(v.id("helpRequests"), v.null()), works: v.array(v.object({ id: v.id("workspaces"), title: v.string(), year: v.string(), group: groupValidator })), remote: v.union(v.null(), v.object({ run: schema.doc("remoteRuns"), version: v.number(), stale: v.boolean() })) }),
  handler: async (ctx, args) => {
    const { workspace, student, userId, admin } = await workspaceViewer(ctx, args.workspaceId);
    const assignment = await ctx.db.get("assignments", workspace.assignmentId);
    const day = assignment ? await ctx.db.get("days", assignment.dayId) : null;
    const files = await workingFiles(ctx, workspace._id);
    const events = await ctx.db.query("assistEvents").withIndex("by_workspaceId_and_at", q => q.eq("workspaceId", workspace._id)).order("desc").take(20);
    const noteRows = await ctx.db.query("guidanceNotes").withIndex("by_workspaceId_and_createdAt", q => q.eq("workspaceId", workspace._id)).order("desc").take(30);
    const notes = [];
    for (const note of noteRows) {
      const author = await ctx.db.query("admins").withIndex("by_userId", q => q.eq("userId", note.authorId)).unique();
      notes.push({ id: note._id, body: note.body, name: firstName(author?.displayName ?? "CodeCS"), at: note.createdAt });
    }
    const sessionRows = await ctx.db.query("assistSessions").withIndex("by_workspaceId_and_joinedAt", q => q.eq("workspaceId", workspace._id)).order("desc").take(50);
    const sessions = sessionRows.filter(s => s.leftAt === undefined && s.expiresAt !== undefined);
    const registered = await ctx.db.query("workspacePresence").withIndex("by_workspaceId", q => q.eq("workspaceId", workspace._id)).unique();
    const token = registered ? await roomPresence.list(ctx, registered.token, 50) : [];
    const cursors = [];
    for (const p of token) {
      if (!p.online) continue;
      const data = p.data as { name?: string; role?: string; file?: string; anchor?: string; head?: string } | undefined;
      if (!data?.name || !data.role) continue;
      cursors.push({ userId: p.userId, name: data.name, role: data.role, file: data.file ?? null, anchor: data.anchor ?? null, head: data.head ?? null });
    }
    const help = await ctx.db.query("helpRequests").withIndex("by_workspaceId_and_status", q => q.eq("workspaceId", workspace._id).eq("status", "open")).first();
    const workRows = admin ? await ctx.db.query("workspaces").withIndex("by_studentId_and_updatedAt", q => q.eq("studentId", student._id)).order("desc").take(100) : [];
    const works = [];
    for (const work of workRows) works.push({ id: work._id, title: (await ctx.db.get("assignments", work.assignmentId))?.title ?? "Assignment", year: work.year, group: work.group });
    const run = await ctx.db.query("remoteRuns").withIndex("by_workspaceId_and_startedAt", q => q.eq("workspaceId", workspace._id)).order("desc").first();
    const version = run ? await ctx.db.get("workVersions", run.versionId) : null;
    return { timeZone: (await getSettings(ctx)).timeZone, curriculumName: (await ctx.db.get("curricula", workspace.curriculumId))?.name ?? "Previous curriculum", workspace, student, task: assignment?.title ?? "Assignment", topic: day?.topic ?? "Lesson", files: files.map(f => ({ name: f.name, content: f.content, revision: f.revision ?? 0, sharedState: f.sharedState ?? sharedBytes(sharedDocument(f.content)) })), events, notes, cursors, sessions, joined: sessions.some(s => s.adminId === userId), helpId: help?._id ?? null, works, remote: run && version ? { run, version: version.number, stale: !sameFiles(files, version.files) } : null };
  },
});

export const requestHelp = mutation({ args: { workspaceId: v.id("workspaces") }, returns: v.id("helpRequests"), handler: async (ctx, args) => {
  const { student } = await requireStudent(ctx);
  const { workspace } = await workspaceViewer(ctx, args.workspaceId);
  await writableClass(ctx, workspace.group);
  const existing = await ctx.db.query("helpRequests").withIndex("by_workspaceId_and_status", q => q.eq("workspaceId", workspace._id).eq("status", "open")).first();
  if (existing) return existing._id;
  return ctx.db.insert("helpRequests", { workspaceId: workspace._id, studentId: student._id, status: "open", createdAt: Date.now() });
} });
export const resolveHelp = mutation({ args: { id: v.id("helpRequests") }, returns: v.null(), handler: async (ctx, args) => {
  const { userId: actorId } = await requireAdmin(ctx);
  const request = await ctx.db.get("helpRequests", args.id);
  if (!request) throw appError("NOT_FOUND", "Help request not found.");
  const workspace = await ctx.db.get("workspaces", request.workspaceId);
  if (workspace) await writableClass(ctx, workspace.group);
  if (request.status === "resolved") return null;
  await ctx.db.patch("helpRequests", request._id, { status: "resolved", resolvedAt: Date.now(), resolvedBy: actorId });
  await recordAdminChange(ctx, { actorId, table: "helpRequests", recordId: request._id, summary: "Resolved a help request", before: { status: "open" }, after: { status: "resolved", workspaceId: request.workspaceId } });
  return null;
} });
export const join = mutation({ args: { workspaceId: v.id("workspaces") }, returns: v.id("assistSessions"), handler: async (ctx, args) => {
  const { userId, admin } = await requireAdmin(ctx);
  await writableClass(ctx, (await workspaceViewer(ctx, args.workspaceId)).workspace.group);
  const current = await ctx.db.query("assistSessions").withIndex("by_workspaceId_and_adminId_and_leftAt", q => q.eq("workspaceId", args.workspaceId).eq("adminId", userId).eq("leftAt", undefined)).first();
  if (current && (current.expiresAt ?? 0) > Date.now()) return current._id;
  if (current) await endSession(ctx, current);
  const expiresAt = Date.now() + 60_000;
  const id = await ctx.db.insert("assistSessions", { workspaceId: args.workspaceId, adminId: userId, joinedAt: Date.now(), expiresAt });
  await ctx.db.insert("assistEvents", { workspaceId: args.workspaceId, actorId: userId, name: firstName(admin.displayName), kind: "joined", at: Date.now() });
  await recordAdminChange(ctx, { actorId: userId, table: "assistSessions", recordId: id, summary: `${admin.displayName} joined student work`, after: { workspaceId: args.workspaceId } });
  await ctx.scheduler.runAt(expiresAt, internal.assistance.expireSession, { id });
  return id;
} });
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
async function endSession(ctx: MutationCtx, session: Doc<"assistSessions">) {
  if (session.leftAt !== undefined) return;
  await ctx.db.patch("assistSessions", session._id, { leftAt: Date.now() });
  const admin = await ctx.db.query("admins").withIndex("by_userId", q => q.eq("userId", session.adminId)).unique();
  await ctx.db.insert("assistEvents", { workspaceId: session.workspaceId, actorId: session.adminId, name: firstName(admin?.displayName ?? "CodeCS"), kind: "left", at: Date.now() });
  await recordAdminChange(ctx, { actorId: session.adminId, table: "assistSessions", recordId: session._id, summary: `${admin?.displayName ?? "Teacher"} left student work`, after: { workspaceId: session.workspaceId, leftAt: Date.now() } });
}
export const expireSession = internalMutation({ args: { id: v.id("assistSessions") }, returns: v.null(), handler: async (ctx, args) => { const session = await ctx.db.get("assistSessions", args.id); if (session && (session.expiresAt ?? 0) <= Date.now()) await endSession(ctx, session); return null; } });
export const leave = mutation({ args: { workspaceId: v.id("workspaces") }, returns: v.null(), handler: async (ctx, args) => { const { userId } = await requireAdmin(ctx); const session = await ctx.db.query("assistSessions").withIndex("by_workspaceId_and_adminId_and_leftAt", q => q.eq("workspaceId", args.workspaceId).eq("adminId", userId).eq("leftAt", undefined)).first(); if (session) await endSession(ctx, session); return null; } });
export const addNote = mutation({ args: { workspaceId: v.id("workspaces"), body: v.string() }, returns: v.id("guidanceNotes"), handler: async (ctx, args) => {
  const { userId: actorId } = await requireAdmin(ctx); await writableClass(ctx, (await workspaceViewer(ctx, args.workspaceId)).workspace.group);
  const body = args.body.trim(); if (!body || body.length > 2000) throw appError("INVALID", "Write a note of 1–2000 characters.");
  const id = await ctx.db.insert("guidanceNotes", { workspaceId: args.workspaceId, authorId: actorId, body, createdAt: Date.now() });
  await recordAdminChange(ctx, { actorId, table: "guidanceNotes", recordId: id, summary: "Added a student-visible guidance note", after: { workspaceId: args.workspaceId } }); return id;
} });
export const setSeat = mutation({ args: { studentId: v.id("students"), seatIndex: v.union(v.number(), v.null()) }, returns: v.null(), handler: async (ctx, args) => {
  const { userId: actorId } = await requireAdmin(ctx); const student = await ctx.db.get("students", args.studentId);
  if (!student || student.deletedAt !== undefined) throw appError("NOT_FOUND", "Student not found.");
  await writableClass(ctx, student.group);
  if (args.seatIndex !== null && (!Number.isInteger(args.seatIndex) || args.seatIndex < 0 || args.seatIndex >= 60)) throw appError("INVALID", "Choose a seat from 1 to 60.");
  const layout = await ctx.db.query("classroomLayouts").withIndex("by_group", q => q.eq("group", student.group)).unique();
  if (args.seatIndex !== null && layout && !layout.desks.some(d => d.seat === args.seatIndex)) throw appError("INVALID", "That desk is not in the classroom layout.");
  if (student.seatIndex === (args.seatIndex ?? undefined)) return null;
  if (args.seatIndex !== null) {
    const occupant = await ctx.db.query("students").withIndex("by_group_and_seatIndex", q => q.eq("group", student.group).eq("seatIndex", args.seatIndex!)).first();
    if (occupant) throw appError("CONFLICT", "That seat is occupied. Clear it first.");
  }
  await ctx.db.patch("students", student._id, { seatIndex: args.seatIndex ?? undefined });
  await recordAdminChange(ctx, { actorId, table: "students", recordId: student._id, summary: `Changed seat for ${student.firstName} ${student.lastName}`, before: { seatIndex: student.seatIndex ?? null }, after: { seatIndex: args.seatIndex } }); return null;
} });
