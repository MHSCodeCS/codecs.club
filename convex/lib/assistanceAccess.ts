import { writableClass } from "./classes";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireViewer } from "./access";
import { appError } from "./errors";

export async function workspaceViewer(ctx: Pick<QueryCtx, "db" | "auth">, workspaceId: Id<"workspaces">) {
  const { userId } = await requireViewer(ctx);
  const workspace = await ctx.db.get("workspaces", workspaceId);
  if (!workspace) throw appError("NOT_FOUND", "Workspace not found.");
  const student = await ctx.db.get("students", workspace.studentId);
  const admin = await ctx.db.query("admins").withIndex("by_userId", q => q.eq("userId", userId)).unique();
  if (!student || (!admin && (student.userId !== userId || student.deletedAt !== undefined))) throw appError("NOT_FOUND", "Workspace not found.");
  return { userId, workspace, student, admin };
}
export async function workspaceWriter(ctx: Pick<QueryCtx, "db" | "auth">, workspaceId: Id<"workspaces">) {
  const access = await workspaceViewer(ctx, workspaceId);
  await writableClass(ctx, access.workspace.group);
  if (access.admin) {
    const session = await ctx.db.query("assistSessions").withIndex("by_workspaceId_and_adminId_and_leftAt", q => q.eq("workspaceId", workspaceId).eq("adminId", access.userId).eq("leftAt", undefined)).first();
    if (!session || (session.expiresAt ?? 0) <= Date.now()) throw appError("FORBIDDEN", "Only students or joined teachers can edit. Join this workspace first.");
  }
  return access;
}
