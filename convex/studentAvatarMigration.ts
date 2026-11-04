import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { studentAvatarColor } from "./lib/studentAvatars";

/** Assign missing colors and replace legacy grays; preserve allowed colors. */
export const assign = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("students").paginate({ cursor: args.cursor ?? null, numItems: 100 });
    for (const student of page.page) {
      if (student.avatarColor !== studentAvatarColor(student)) await ctx.db.patch("students", student._id, { avatarColor: studentAvatarColor(student) });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.studentAvatarMigration.assign, { cursor: page.continueCursor });
    return null;
  },
});
