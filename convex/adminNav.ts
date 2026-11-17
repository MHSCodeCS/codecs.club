import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/access";

/** Counts are capped; the sidebar shows "99+" past the cap. */
const BADGE_CAP = 100;

/** Badge counts for the admin sidebar. */
export const badges = query({
  args: {},
  returns: v.object({ openHelp: v.number(), unreviewed: v.number() }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const openHelp = await ctx.db
      .query("helpRequests")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "open"))
      .take(BADGE_CAP);
    const unreviewed = await ctx.db
      .query("submissions")
      .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "unreviewed"))
      .take(BADGE_CAP);
    return { openHelp: openHelp.length, unreviewed: unreviewed.length };
  },
});
