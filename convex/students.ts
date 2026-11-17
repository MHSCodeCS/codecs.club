import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/** Resolves a normalized login code to the student's auth user. */
export const userIdForLoginCode = internalQuery({
  args: { loginCode: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) => {
    const student = await ctx.db
      .query("students")
      .withIndex("by_loginCode", (q) => q.eq("loginCode", args.loginCode))
      .unique();
    return student?.userId ?? null;
  },
});
