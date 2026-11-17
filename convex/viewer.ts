import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { groupValidator } from "./schema";

const viewerValidator = v.union(
  v.null(),
  v.object({
    role: v.literal("admin"),
    name: v.string(),
    username: v.string(),
  }),
  v.object({
    role: v.literal("student"),
    name: v.string(),
    loginCode: v.string(),
    group: groupValidator,
  }),
);

/** The signed-in person, or null when signed out or not linked to a role. */
export const current = query({
  args: {},
  returns: viewerValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (admin !== null) {
      return { role: "admin" as const, name: admin.displayName, username: admin.username };
    }
    const student = await ctx.db
      .query("students")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (student !== null) {
      return {
        role: "student" as const,
        name: `${student.firstName} ${student.lastName}`,
        loginCode: student.loginCode,
        group: student.group,
      };
    }
    return null;
  },
});
