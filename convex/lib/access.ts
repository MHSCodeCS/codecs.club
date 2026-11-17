import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { appError } from "./errors";

/**
 * Authorization helpers. Identity always comes from the session, never from a
 * function argument. Mutation contexts satisfy QueryCtx's `db` and `auth`.
 */
type AuthCtx = Pick<QueryCtx, "db" | "auth">;

export async function requireViewer(
  ctx: AuthCtx,
): Promise<{ userId: Id<"users">; user: Doc<"users"> }> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw appError("UNAUTHENTICATED", "Sign in to continue.");
  const user = await ctx.db.get("users", userId);
  if (user === null) throw appError("UNAUTHENTICATED", "Sign in to continue.");
  return { userId, user };
}

export async function requireAdmin(
  ctx: AuthCtx,
): Promise<{ userId: Id<"users">; admin: Doc<"admins"> }> {
  const { userId } = await requireViewer(ctx);
  const admin = await ctx.db
    .query("admins")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (admin === null) throw appError("FORBIDDEN", "Only admins can do that.");
  return { userId, admin };
}

export async function requireStudent(
  ctx: AuthCtx,
): Promise<{ userId: Id<"users">; student: Doc<"students"> }> {
  const { userId } = await requireViewer(ctx);
  const student = await ctx.db
    .query("students")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (student === null) throw appError("FORBIDDEN", "Only students can do that.");
  return { userId, student };
}

export async function getSettings(ctx: Pick<QueryCtx, "db">): Promise<Doc<"settings">> {
  const settings = await ctx.db.query("settings").first();
  if (settings === null) throw appError("NOT_FOUND", "App settings are missing. Run the seed.");
  return settings;
}
