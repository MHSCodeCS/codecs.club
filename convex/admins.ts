import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";
import { normalizeUsername } from "./auth";
import { startsWithTitle } from "./lib/adminNames";
import { appError } from "./lib/errors";

/** Admins are students who run the club: a plain name, never a title. */
function cleanDisplayName(value: string): string {
  const displayName = value.trim();
  if (displayName.length === 0 || displayName.length > 60) {
    throw appError("INVALID", "Give a display name of 1–60 characters, e.g. Max.");
  }
  if (startsWithTitle(displayName)) {
    throw appError("INVALID", "Use your name without a title, e.g. Max.");
  }
  return displayName;
}

/**
 * Provisions an admin account. Run from the CLI (never exposed to clients):
 *   npx convex run admins:createAdmin '{"username":"max","displayName":"Max","password":"…"}'
 * Students see the first word of the display name. The password is hashed by
 * Convex Auth; it is never stored or logged in plain text.
 */
export const createAdmin = internalAction({
  args: { username: v.string(), displayName: v.string(), password: v.string() },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    const username = normalizeUsername(args.username);
    const displayName = cleanDisplayName(args.displayName);
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      throw appError("INVALID", "Usernames are 3–32 letters, digits, dots, dashes or underscores.");
    }
    if (args.password.length < 10) {
      throw appError("INVALID", "Use a password of at least 10 characters.");
    }
    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: username, secret: args.password },
      profile: { name: displayName, role: "admin" },
    });
    await ctx.runMutation(internal.admins.insertAdmin, {
      userId: user._id,
      username,
      displayName,
    });
    return user._id;
  },
});

export const insertAdmin = internalMutation({
  args: { userId: v.id("users"), username: v.string(), displayName: v.string() },
  returns: v.id("admins"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (existing !== null) throw appError("CONFLICT", `Admin "${args.username}" already exists.`);
    return await ctx.db.insert("admins", args);
  },
});

/**
 * Renames an admin, e.g. to drop a title from an older account. Run from the CLI:
 *   npx convex run admins:setDisplayName '{"username":"max","displayName":"Max"}'
 */
export const setDisplayName = internalMutation({
  args: { username: v.string(), displayName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const displayName = cleanDisplayName(args.displayName);
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_username", (q) => q.eq("username", normalizeUsername(args.username)))
      .unique();
    if (admin === null) throw appError("NOT_FOUND", `No admin "${args.username}".`);
    await ctx.db.patch("admins", admin._id, { displayName });
    await ctx.db.patch("users", admin.userId, { name: displayName });
    return null;
  },
});
