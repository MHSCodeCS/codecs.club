import { firstName } from "./lib/adminNames";
import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import schema from "./schema";
import { requireAdmin } from "./lib/access";
import { workspaceViewer, workspaceWriter } from "./lib/assistanceAccess";
import { appError } from "./lib/errors";
import { recordAdminChange } from "./lib/changes";
import { workingFiles, latestVersion, snapshot } from "./workspaces";
import { sameFiles } from "./lib/workFiles";

export const start = mutation({
  args: { workspaceId: v.id("workspaces"), entry: v.string(), key: v.string() },
  returns: v.object({ run: schema.doc("remoteRuns"), files: v.array(v.object({ name: v.string(), content: v.string() })) }),
  handler: async (ctx, args) => {
    const { admin } = await requireAdmin(ctx);
    const { userId, workspace } = await workspaceWriter(ctx, args.workspaceId);
    if (!args.key || args.key.length > 100) throw appError("INVALID", "Invalid run key.");
    const existing = await ctx.db.query("remoteRuns").withIndex("by_actorId_and_key", q => q.eq("actorId", userId).eq("key", args.key)).unique();
    if (existing) {
      if (existing.workspaceId !== workspace._id || existing.entry !== args.entry) throw appError("CONFLICT", "Run retry key already used.");
      return { run: existing, files: (await ctx.db.get("workVersions", existing.versionId))!.files };
    }
    const recent = await ctx.db.query("remoteRuns").withIndex("by_workspaceId_and_startedAt", q => q.eq("workspaceId", workspace._id)).order("desc").first();
    if (recent?.status === "running" && recent.expiresAt > Date.now()) throw appError("CONFLICT", "A teacher run is already active. Stop it or wait for it to finish.");
    if (recent?.status === "running") await ctx.db.patch("remoteRuns", recent._id, { status: "interrupted", updatedAt: Date.now() });
    const files = await workingFiles(ctx, workspace._id);
    if (!args.entry.endsWith(".py") || !files.some(f => f.name === args.entry)) throw appError("INVALID", "Choose a saved Python file.");
    const previous = await latestVersion(ctx, workspace._id);
    const now = Date.now();
    let versionId = previous?._id;
    if (!previous || !sameFiles(files, previous.files)) {
      const number = Math.max(workspace.latestVersion, previous?.number ?? 0) + 1;
      versionId = await ctx.db.insert("workVersions", { workspaceId: workspace._id, number, files: snapshot(files), createdBy: userId, createdAt: now, reason: "teacher" });
      await ctx.db.patch("workspaces", workspace._id, { latestVersion: number });
    }
    const expiresAt = now + 30_000;
    const id = await ctx.db.insert("remoteRuns", { workspaceId: workspace._id, versionId: versionId!, actorId: userId, actorName: firstName(admin.displayName), key: args.key, entry: args.entry, packages: workspace.packages ?? [], status: "running", output: "", outputTruncated: false, stopRequested: false, startedAt: now, updatedAt: now, expiresAt });
    await recordAdminChange(ctx, { actorId: userId, table: "remoteRuns", recordId: id, summary: `${admin.displayName} ran saved student work`, after: { workspaceId: workspace._id, versionId, entry: args.entry, executor: "teacher browser" } });
    await ctx.scheduler.runAt(expiresAt, internal.remoteRuns.expire, { id });
    return { run: (await ctx.db.get("remoteRuns", id))!, files: snapshot(files) };
  },
});
export const publish = mutation({
  args: { id: v.id("remoteRuns"), output: v.string(), outputTruncated: v.boolean(), status: v.union(v.literal("running"), v.literal("finished"), v.literal("error"), v.literal("stopped")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const run = await ctx.db.get("remoteRuns", args.id);
    if (!run || run.actorId !== userId) throw appError("NOT_FOUND", "Run not found.");
    if (run.status !== "running") return null; // Late results never revive a replaced/expired run.
    if (run.expiresAt <= Date.now()) { await ctx.db.patch("remoteRuns", run._id, { status: "interrupted", updatedAt: Date.now() }); return null; }
    if (args.output.length > 100_000) throw appError("INVALID", "Shared output must stay under 100,000 characters.");
    await ctx.db.patch("remoteRuns", run._id, { output: args.output, outputTruncated: args.outputTruncated, status: args.status, updatedAt: Date.now(), expiresAt: Date.now() + 30_000 });
    // One watchdog per interval, not one scheduled job per output chunk.
    return null;
  },
});
export const stop = mutation({ args: { id: v.id("remoteRuns") }, returns: v.null(), handler: async (ctx, args) => {
  const run = await ctx.db.get("remoteRuns", args.id); if (!run) throw appError("NOT_FOUND", "Run not found.");
  await workspaceViewer(ctx, run.workspaceId);
  if (run.status === "running") await ctx.db.patch("remoteRuns", run._id, { stopRequested: true });
  return null;
} });
export const expire = internalMutation({ args: { id: v.id("remoteRuns") }, returns: v.null(), handler: async (ctx, args) => {
  const run = await ctx.db.get("remoteRuns", args.id);
  if (run?.status === "running") {
    if (run.expiresAt <= Date.now()) await ctx.db.patch("remoteRuns", run._id, { status: "interrupted", updatedAt: Date.now() });
    else await ctx.scheduler.runAt(run.expiresAt, internal.remoteRuns.expire, { id: run._id });
  }
  return null;
} });
