import { classFor } from "./lib/classes";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/access";

/** Counts are capped; the sidebar shows "99+" past the cap. */
const BADGE_CAP = 100;

/** Badge counts for the admin sidebar. */
export const badges = query({
  args: { group: v.optional(v.string()) },
  returns: v.object({ openHelp: v.number(), unreviewed: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const openHelp = await ctx.db
      .query("helpRequests")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "open"))
      .take(BADGE_CAP);
    const unreviewed = await ctx.db
      .query("submissions")
      .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "unreviewed"))
      .take(BADGE_CAP);
    let helpCount = 0, reviewCount = 0;
    for (const row of openHelp) { const w = await ctx.db.get("workspaces", row.workspaceId); if (w && (!args.group || args.group === w.group) && (await classFor(ctx, w.group))?.status !== "archived") helpCount++; }
    for (const row of unreviewed) { const w = await ctx.db.get("workspaces", row.workspaceId); if (w && (!args.group || args.group === w.group) && (await classFor(ctx, w.group))?.status !== "archived") reviewCount++; }
    return { openHelp: helpCount, unreviewed: reviewCount };
  },
});
