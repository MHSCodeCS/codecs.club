import { firstName } from "./lib/adminNames";
import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { requireStudent } from "./lib/access";
import { workspaceWriter } from "./lib/assistanceAccess";
import { appError } from "./lib/errors";

export const roomPresence = new Presence(components.presence);
export const heartbeat = mutation({
  args: { sessionId: v.string(), workspaceId: v.optional(v.id("workspaces")), active: v.boolean(), focused: v.optional(v.boolean()), file: v.optional(v.string()), anchor: v.optional(v.string()), head: v.optional(v.string()) },
  returns: v.object({ tokens: v.array(v.string()), userId: v.id("users") }),
  handler: async (ctx, args) => {
    if (!args.sessionId || args.sessionId.length > 100 || (args.file?.length ?? 0) > 100 || (args.anchor?.length ?? 0) > 2000 || (args.head?.length ?? 0) > 2000) throw appError("INVALID", "Invalid presence data.");
    const workspaceAccess = args.workspaceId ? await workspaceWriter(ctx, args.workspaceId) : null;
    const access = workspaceAccess ?? await requireStudent(ctx);
    const { userId, student } = access;
    const tokens = [];
    if (!workspaceAccess?.admin) {
      tokens.push((await roomPresence.heartbeat(ctx, `group:${student.group}`, userId, `${userId}:group:${student.group}:${args.sessionId}`, 10_000)).sessionToken);
      // One focus session per browser tab. Disconnecting a hidden tab must not
      // clear another tab's focus presence for the same student.
      const focus = await roomPresence.heartbeat(ctx, `focused:${student.group}`, userId, `${userId}:focused:${student.group}:${args.sessionId}`, 10_000);
      if (args.focused === false) await roomPresence.disconnect(ctx, focus.sessionToken);
      else tokens.push(focus.sessionToken);
      if (args.active) tokens.push((await roomPresence.heartbeat(ctx, `active:${student.group}`, userId, `${userId}:active:${student.group}:${args.sessionId}`, 48_000)).sessionToken);
    }
    if (args.workspaceId && workspaceAccess) {
      const room = `workspace:${args.workspaceId}`;
      const heartbeat = await roomPresence.heartbeat(ctx, room, userId, `${userId}:${room}:${args.sessionId}`, 10_000);
      tokens.push(heartbeat.sessionToken);
      const registered = await ctx.db.query("workspacePresence").withIndex("by_workspaceId", q => q.eq("workspaceId", args.workspaceId!)).unique();
      if (!registered) await ctx.db.insert("workspacePresence", { workspaceId: args.workspaceId, token: heartbeat.roomToken });
      await roomPresence.updateRoomUser(ctx, room, userId, { name: workspaceAccess.admin ? firstName(workspaceAccess.admin.displayName) : `${student.firstName} ${student.lastName}`, role: workspaceAccess.admin ? "teacher" : "student", file: args.file ?? null, anchor: args.anchor ?? null, head: args.head ?? null });
      if (workspaceAccess.admin) {
        const session = await ctx.db.query("assistSessions").withIndex("by_workspaceId_and_adminId_and_leftAt", q => q.eq("workspaceId", args.workspaceId!).eq("adminId", userId).eq("leftAt", undefined)).first();
        if (session && (session.expiresAt ?? 0) - Date.now() < 30_000) {
          const expiresAt = Date.now() + 60_000;
          await ctx.db.patch("assistSessions", session._id, { expiresAt });
          await ctx.scheduler.runAt(expiresAt, internal.assistance.expireSession, { id: session._id });
        }
      }
    }
    return { tokens, userId };
  },
});
/** A random component capability token can only disconnect its own session. */
export const disconnect = mutation({ args: { sessionToken: v.string() }, returns: v.null(), handler: (ctx, args) => roomPresence.disconnect(ctx, args.sessionToken) });
