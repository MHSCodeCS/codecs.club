import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Appends to admin change history. Call in the same mutation as the change.
 * Callers must never pass passwords or other secrets in before/after.
 */
export async function recordAdminChange(
  ctx: Pick<MutationCtx, "db">,
  change: {
    actorId: Id<"users">;
    table: string;
    recordId: string;
    summary: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  },
): Promise<void> {
  const actor = await ctx.db.query("admins").withIndex("by_userId", q => q.eq("userId", change.actorId)).unique();
  await ctx.db.insert("adminChanges", {
    actorName: actor?.displayName,
    actorId: change.actorId,
    at: Date.now(),
    table: change.table,
    recordId: change.recordId,
    summary: change.summary,
    before: change.before ? JSON.stringify(change.before) : undefined,
    after: change.after ? JSON.stringify(change.after) : undefined,
  });
}
