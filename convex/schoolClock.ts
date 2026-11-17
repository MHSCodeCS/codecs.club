import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { zonedDateKey } from "./lib/time";

/**
 * Keeps `schoolClock.today` on the current date in the school time zone. The
 * cron runs it every few minutes; it writes only when the date (or the time
 * zone) changes, about once a day, and that write re-runs the student queries
 * that decide which lesson days are open (D04).
 */
export const advance = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").first();
    if (settings === null) return null;
    const now = Date.now();
    const today = zonedDateKey(now, settings.timeZone);
    const clock = await ctx.db.query("schoolClock").first();
    if (clock === null) {
      await ctx.db.insert("schoolClock", { today, timeZone: settings.timeZone, updatedAt: now });
    } else if (clock.today !== today || clock.timeZone !== settings.timeZone) {
      await ctx.db.patch("schoolClock", clock._id, {
        today,
        timeZone: settings.timeZone,
        updatedAt: now,
      });
    }
    return null;
  },
});
