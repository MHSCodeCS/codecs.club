import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/access";

/** Admin change history, newest first. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("adminChanges"),
      at: v.number(),
      actorName: v.string(),
      table: v.string(),
      summary: v.string(),
      before: v.union(v.string(), v.null()),
      after: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query("adminChanges")
      .withIndex("by_at")
      .order("desc")
      .paginate(args.paginationOpts);
    const names = new Map<string, string>();
    const page = [];
    for (const change of result.page) {
      let actorName = names.get(change.actorId);
      if (actorName === undefined) {
        const admin = await ctx.db
          .query("admins")
          .withIndex("by_userId", (q) => q.eq("userId", change.actorId))
          .unique();
        actorName = admin?.displayName ?? "Unknown admin";
        names.set(change.actorId, actorName);
      }
      page.push({
        _id: change._id,
        at: change.at,
        actorName,
        table: change.table,
        summary: change.summary,
        before: change.before ?? null,
        after: change.after ?? null,
      });
    }
    return { ...result, page };
  },
});
