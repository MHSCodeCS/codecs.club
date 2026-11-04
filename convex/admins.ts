import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { normalizeUsername } from "./auth";
import { startsWithTitle } from "./lib/adminNames";
import { appError } from "./lib/errors";
import { requireAdmin } from "./lib/access";
import { recordAdminChange } from "./lib/changes";
import { baseLoginCode } from "./lib/loginCodes";
import { avatarColors, avatarColorValidator, studentAvatarColor } from "./lib/studentAvatars";

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
    return await ctx.db.insert("admins", { ...args, avatarColor: avatarColors[Math.floor(Math.random() * avatarColors.length)] });
  },
});


function teacherDetails(first: string, last: string, password?: string) {
  const firstName = first.trim(), lastName = last.trim();
  if (!firstName || !lastName || firstName.length > 50 || lastName.length > 50) {
    throw appError("INVALID", "Enter a first and last name of up to 50 characters each.");
  }
  if (password !== undefined && (password.length < 10 || password.length > 256)) {
    throw appError("INVALID", "Use a password of 10–256 characters.");
  }
  if (startsWithTitle(firstName)) throw appError("INVALID", "Use a first name without a title.");
  return { firstName, lastName, displayName: `${firstName} ${lastName}` };
}

async function allocateTeacherUsername(ctx: Pick<QueryCtx, "db">, firstName: string, lastName: string) {
  const base = baseLoginCode(firstName, lastName);
  for (let suffix = 0; suffix < 1000; suffix++) {
    const candidate = suffix === 0 ? base : `${base}${suffix}`;
    const admin = await ctx.db.query("admins").withIndex("by_username", q => q.eq("username", candidate)).first();
    const account = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", q =>
      q.eq("provider", "password").eq("providerAccountId", candidate)).first();
    if (!admin && !account) return candidate;
  }
  throw appError("CONFLICT", "No free login code for this name.");
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({
    _id: v.id("admins"), username: v.string(), displayName: v.string(), isSelf: v.boolean(),
    firstName: v.string(), lastName: v.string(), avatarColor: avatarColorValidator,
  })),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const result = await ctx.db.query("admins").withIndex("by_username").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(admin => ({
      _id: admin._id, username: admin.username, displayName: admin.displayName, isSelf: admin.userId === userId,
      firstName: admin.firstName ?? admin.displayName.trim().split(/\s+/)[0] ?? "",
      lastName: admin.lastName ?? admin.displayName.trim().split(/\s+/).slice(1).join(" "),
      avatarColor: studentAvatarColor(admin),
    })) };
  },
});

/** The Auth store runs as a subtransaction: credentials, profile and audit commit together. */
export const createStaff = mutation({
  args: { firstName: v.string(), lastName: v.string(), password: v.string() },
  returns: v.id("admins"),
  handler: async (ctx, args): Promise<Id<"admins">> => {
    const { userId: actorId } = await requireAdmin(ctx);
    const names = teacherDetails(args.firstName, args.lastName, args.password);
    const username = await allocateTeacherUsername(ctx, names.firstName, names.lastName);
    const details = { ...names, username };
    const result = await ctx.runMutation(internal.auth.store, { args: {
      type: "createAccountFromCredentials", provider: "password",
      account: { id: details.username, secret: args.password },
      profile: { name: details.displayName, role: "admin" },
    } });
    if (!result || typeof result !== "object" || !("user" in result)) throw appError("INVALID", "Could not create teacher sign-in account.");
    const id = await ctx.db.insert("admins", { userId: result.user._id, ...details, avatarColor: avatarColors[Math.floor(Math.random() * avatarColors.length)] });
    await recordAdminChange(ctx, { actorId, table: "admins", recordId: result.user._id,
      summary: `Added teacher account ${details.displayName}`, after: details });
    return id;
  },
});

export const updateStaff = mutation({
  args: { adminId: v.id("admins"), firstName: v.string(), lastName: v.string(), password: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId: actorId } = await requireAdmin(ctx);
    const details = teacherDetails(args.firstName, args.lastName, args.password);
    const admin = await ctx.db.get("admins", args.adminId);
    if (!admin) throw appError("NOT_FOUND", "Teacher account no longer exists.");
    const account = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q =>
      q.eq("userId", admin.userId).eq("provider", "password")).unique();
    if (!account) throw appError("NOT_FOUND", "Teacher sign-in account is missing.");
    if (admin.firstName === details.firstName && admin.lastName === details.lastName && args.password === undefined) return null;
    if (args.password !== undefined) {
      await ctx.runMutation(internal.auth.store, { args: { type: "modifyAccount", provider: "password",
        account: { id: admin.username, secret: args.password } } });
      await ctx.runMutation(internal.auth.store, { args: { type: "invalidateSessions", userId: admin.userId } });
    }
    await ctx.db.patch("admins", admin._id, details);
    await ctx.db.patch("users", admin.userId, { name: details.displayName });
    await recordAdminChange(ctx, { actorId, table: "admins", recordId: admin.userId,
      summary: `Updated teacher account ${details.displayName}${args.password !== undefined ? " (password reset)" : ""}`,
      before: { username: admin.username, displayName: admin.displayName }, after: details });
    return null;
  },
});

export const deleteStaff = mutation({
  args: { adminId: v.id("admins") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId: actorId } = await requireAdmin(ctx);
    const admin = await ctx.db.get("admins", args.adminId);
    if (!admin) throw appError("NOT_FOUND", "Teacher account no longer exists.");
    if (admin.userId === actorId) throw appError("INVALID", "You cannot delete your own teacher account.");
    // Record the removed identity inside the audit log itself. Legacy entries
    // can still resolve this name without retaining a user or admin account.
    await recordAdminChange(ctx, { actorId, table: "admins", recordId: admin.userId,
      summary: `Deleted teacher account ${admin.displayName}; access revoked`,
      before: { username: admin.username, displayName: admin.displayName } });
    await ctx.runMutation(internal.auth.store, { args: { type: "invalidateSessions", userId: admin.userId } });
    for await (const account of ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", admin.userId))) {
      for await (const code of ctx.db.query("authVerificationCodes").withIndex("accountId", q => q.eq("accountId", account._id))) {
        await ctx.db.delete("authVerificationCodes", code._id);
      }
      await ctx.db.delete("authAccounts", account._id);
    }
    await ctx.db.delete("admins", admin._id);
    await ctx.db.delete("users", admin.userId);
    return null;
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
