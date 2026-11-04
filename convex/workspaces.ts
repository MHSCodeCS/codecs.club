import { classYear, classFor, writableClass } from "./lib/classes";
import * as Y from "yjs";
import { sharedBytes, sharedDocument, replaceSharedText } from "./lib/sharedText";
import { recordAdminChange } from "./lib/changes";
import { workspaceWriter } from "./lib/assistanceAccess";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getSettings, requireStudent } from "./lib/access";
import { adminFirstName } from "./lib/adminNames";
import { appError } from "./lib/errors";
import { MAX_PACKAGES, packageKey, packageSpecProblem } from "./lib/packages";
import {
  byteLength,
  compareFileNames,
  fileNameProblem,
  fileSizeProblem,
  MAX_FILES,
  MAX_WORKSPACE_BYTES,
  sameFiles,
} from "./lib/workFiles";
import { groupValidator, assignmentTypeValidator, fileValidator } from "./schema";

/**
 * The student Assignment Workspace: open (or start) a workspace, autosave its
 * files, and list, inspect and restore versions. Every function derives the
 * student from the session; workspace ids are checked against that student.
 */

/** Autosaves add a version at most this often; the working copy saves every time. */
export const CHECKPOINT_MS = 2 * 60_000;

type File = { name: string; content: string };
type AuthCtx = Pick<QueryCtx, "db" | "auth">;

const versionReasonValidator = v.union(
  v.literal("start"),
  v.literal("autosave"),
  v.literal("restore"),
  // Legacy stored literal for an edit made by an admin (see schema).
  v.literal("teacher"),
  v.literal("submit"),
  v.literal("check"),
);

const versionSummaryValidator = v.object({
  number: v.number(),
  createdAt: v.number(),
  reason: versionReasonValidator,
  restoredFrom: v.union(v.number(), v.null()),
  by: v.string(),
  fileNames: v.array(v.string()),
});

/** The caller's own workspace. Someone else's id reads as not found. */
export async function requireOwnWorkspace(
  ctx: AuthCtx,
  workspaceId: Id<"workspaces">,
): Promise<{ userId: Id<"users">; student: Doc<"students">; workspace: Doc<"workspaces"> }> {
  const { userId, student } = await requireStudent(ctx);
  const workspace = await ctx.db.get("workspaces", workspaceId);
  if (workspace === null || workspace.studentId !== student._id) {
    throw appError("NOT_FOUND", "Workspace not found.");
  }
  return { userId, student, workspace };
}

/**
 * An assignment the student may open: their own existing workspace (including
 * past curricula), or a published assignment in their current curriculum.
 * Drafts never open.
 */
async function openableAssignment(
  ctx: AuthCtx,
  student: Doc<"students">,
  rawAssignmentId: string,
) {
  const assignmentId = ctx.db.normalizeId("assignments", rawAssignmentId);
  if (assignmentId === null) return null;
  const assignment = await ctx.db.get("assignments", assignmentId);
  if (assignment === null) return null;
  const day = await ctx.db.get("days", assignment.dayId);
  if (day === null) return null;
  const workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_studentId_and_assignmentId", (q) =>
      q.eq("studentId", student._id).eq("assignmentId", assignment._id),
    )
    .unique();
  const revision = assignment.publishedRevisionId
    ? await ctx.db.get("assignmentRevisions", assignment.publishedRevisionId)
    : null;
  if (workspace === null) {
    const classroom = await classFor(ctx, student.group);
    const startable =
      (!classroom || classroom.status === "current") &&
      assignment.status === "published" &&
      revision !== null &&
      day.curriculumId === student.curriculumId;
    if (!startable) return null;
  }
  return { assignment, day, revision, workspace };
}

export async function workingFiles(
  ctx: Pick<QueryCtx, "db">,
  workspaceId: Id<"workspaces">,
): Promise<Doc<"workFiles">[]> {
  const files = await ctx.db
    .query("workFiles")
    .withIndex("by_workspaceId_and_name", (q) => q.eq("workspaceId", workspaceId))
    .take(MAX_FILES + 1);
  return files.sort((a, b) => compareFileNames(a.name, b.name));
}

export async function latestVersion(ctx: Pick<QueryCtx, "db">, workspaceId: Id<"workspaces">) {
  return await ctx.db
    .query("workVersions")
    .withIndex("by_workspaceId_and_number", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .first();
}

export function snapshot(files: ReadonlyArray<File>): File[] {
  return files
    .map((f) => ({ name: f.name, content: f.content }))
    .sort((a, b) => compareFileNames(a.name, b.name));
}

const revisionOf = (file: Doc<"workFiles">) => file.revision ?? 0;

/** "you" for the student, otherwise the admin's first name. */
function authorNamer(ctx: Pick<QueryCtx, "db">, student: Doc<"students">) {
  const cache = new Map<Id<"users">, string>();
  return async (userId: Id<"users">): Promise<string> => {
    if (userId === student.userId) return "you";
    const cached = cache.get(userId);
    if (cached !== undefined) return cached;
    const name = await adminFirstName(ctx, userId);
    cache.set(userId, name);
    return name;
  };
}

/** Task and the working copy for one assignment (turn-in is `submissions.forWorkspace`). */
export const get = query({
  args: { assignmentId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      archived: v.boolean(),
      timeZone: v.string(),
      assignment: v.object({
        _id: v.id("assignments"),
        title: v.string(),
        type: assignmentTypeValidator,
        instructions: v.string(),
        expectedOutput: v.union(v.string(), v.null()),
      }),
      day: v.object({
        _id: v.id("days"),
        order: v.number(),
        topic: v.string(),
        slidesUrl: v.union(v.string(), v.null()),
        inCurrentCurriculum: v.boolean(),
        year: v.string(),
        group: groupValidator,
        curriculumName: v.string(),
      }),
      workspace: v.union(
        v.null(),
        v.object({
          _id: v.id("workspaces"),
          latestVersion: v.number(),
          updatedAt: v.number(),
          packages: v.array(v.string()),
          files: v.array(
            v.object({ name: v.string(), content: v.string(), revision: v.number(), sharedState: v.bytes() }),
          ),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx);
    const found = await openableAssignment(ctx, student, args.assignmentId);
    if (found === null) return null;
    const { assignment, day, revision, workspace } = found;
    const settings = await getSettings(ctx);
    const files = workspace ? await workingFiles(ctx, workspace._id) : [];
    return {
      archived: (await classFor(ctx, workspace?.group ?? student.group))?.status === "archived",
      timeZone: settings.timeZone,
      assignment: {
        _id: assignment._id,
        title: assignment.title,
        type: assignment.type,
        instructions: revision?.instructions ?? "",
        expectedOutput: revision?.expectedOutput ?? null,
      },
      day: {
        _id: day._id,
        order: day.order,
        topic: day.topic,
        slidesUrl: day.slidesUrl ?? null,
        inCurrentCurriculum: (await classFor(ctx, student.group))?.status !== "archived" && day.curriculumId === student.curriculumId && (!workspace || workspace.year === await classYear(ctx, student.group)),
        year: workspace?.year ?? await classYear(ctx, student.group),
        group: workspace?.group ?? student.group,
        curriculumName: (await ctx.db.get("curricula", workspace?.curriculumId ?? day.curriculumId))?.name ?? "Previous curriculum",
      },
      workspace: workspace && {
        _id: workspace._id,
        latestVersion: workspace.latestVersion,
        updatedAt: workspace.updatedAt,
        packages: workspace.packages ?? [],
        files: files.map((f) => ({ name: f.name, content: f.content, revision: revisionOf(f), sharedState: f.sharedState ?? sharedBytes(sharedDocument(f.content)) })),
      },
    };
  },
});

/**
 * Returns the student's workspace for an assignment, creating it from the
 * published starter files (as version 1) the first time.
 */
export const open = mutation({
  args: { assignmentId: v.string() },
  returns: v.id("workspaces"),
  handler: async (ctx, args) => {
    const { userId, student } = await requireStudent(ctx);
    const found = await openableAssignment(ctx, student, args.assignmentId);
    if (found === null) throw appError("NOT_FOUND", "This assignment isn’t available.");
    if (found.workspace !== null) return found.workspace._id;
    await writableClass(ctx, student.group);
    const { assignment, day, revision } = found;
    if (revision === null) throw appError("NOT_FOUND", "This assignment isn’t available.");

    const now = Date.now();
    const starter = snapshot(
      revision.starterFiles.length > 0 ? revision.starterFiles : [{ name: "main.py", content: "" }],
    );
    const workspaceId = await ctx.db.insert("workspaces", {
      studentId: student._id,
      assignmentId: assignment._id,
      year: await classYear(ctx, student.group),
      group: student.group,
      curriculumId: day.curriculumId,
      latestVersion: 1,
      updatedAt: now,
    });
    for (const file of starter) {
      await ctx.db.insert("workFiles", {
        workspaceId,
        name: file.name,
        content: file.content,
        updatedAt: now,
        updatedBy: userId,
        revision: 1,
      });
    }
    await ctx.db.insert("workVersions", {
      workspaceId,
      number: 1,
      files: starter,
      createdBy: userId,
      createdAt: now,
      reason: "start",
    });
    return workspaceId;
  },
});

/**
 * Autosave: writes changed files (creating new ones) and adds a version when
 * the last one is older than CHECKPOINT_MS. A file whose revision moved past
 * `baseRevision` was changed elsewhere (another tab); the working copy is
 * snapshotted into history first so that change is never lost.
 */
export const saveFiles = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    files: v.array(
      v.object({ name: v.string(), content: v.string(), baseRevision: v.number(), sharedUpdate: v.optional(v.bytes()) }),
    ),
  },
  returns: v.object({
    savedAt: v.number(),
    files: v.array(v.object({ name: v.string(), revision: v.number(), sharedState: v.optional(v.bytes()) })),
  }),
  handler: async (ctx, args) => {
    const { userId, workspace, admin } = await workspaceWriter(ctx, args.workspaceId);
    if (args.files.length > MAX_FILES) {
      throw appError("INVALID", `A workspace can have at most ${MAX_FILES} files.`);
    }
    if (new Set(args.files.map((f) => f.name)).size !== args.files.length) {
      throw appError("INVALID", "The same file was sent twice.");
    }
    for (const file of args.files) {
      const problem = fileNameProblem(file.name) ?? fileSizeProblem(file.name, file.content);
      if (problem !== null) throw appError("INVALID", problem);
    }

    const current = await workingFiles(ctx, workspace._id);
    const byName = new Map(current.map((f) => [f.name, f]));
    const incoming = args.files.map(file => {
      const previous = byName.get(file.name);
      const doc = sharedDocument(previous?.content ?? "", previous?.sharedState);
      if (file.sharedUpdate) {
        if (file.sharedUpdate.byteLength > 800_000) throw appError("INVALID", "Shared edit is too large.");
        try { Y.applyUpdate(doc, new Uint8Array(file.sharedUpdate)); }
        catch { throw appError("INVALID", "Invalid shared edit."); }
      } else replaceSharedText(doc, file.content);
      const content = doc.getText("code").toString();
      const problem = fileSizeProblem(file.name, content);
      if (problem) throw appError("INVALID", problem);
      const sharedState = sharedBytes(doc);
      doc.destroy();
      if (sharedState.byteLength > 800_000) throw appError("INVALID", "This file’s shared edit history is full. Download a copy before starting a fresh file.");
      return { ...file, content, sharedState };
    });
    const added = incoming.filter((f) => !byName.has(f.name));
    for (const file of added) {
      const clash = current.find((c) => c.name.toLowerCase() === file.name.toLowerCase());
      if (clash) throw appError("CONFLICT", `There is already a file named ${clash.name}.`);
    }
    if (current.length + added.length > MAX_FILES) {
      throw appError("INVALID", `A workspace can have at most ${MAX_FILES} files.`);
    }
    const after = new Map(current.map((f) => [f.name, f.content]));
    for (const file of incoming) after.set(file.name, file.content);
    const totalBytes = [...after.values()].reduce((sum, c) => sum + byteLength(c), 0);
    if (totalBytes > MAX_WORKSPACE_BYTES) {
      throw appError(
        "INVALID",
        `All files together must stay under ${MAX_WORKSPACE_BYTES / 1000} KB.`,
      );
    }

    const changed = incoming.filter((f) => byName.get(f.name)?.content !== f.content || (f.sharedUpdate !== undefined && !equalBytes(byName.get(f.name)?.sharedState, f.sharedState)));
    if (changed.length === 0) {
      return {
        savedAt: workspace.updatedAt,
        files: incoming.map((f) => ({ name: f.name, revision: revisionOf(byName.get(f.name)!), sharedState: f.sharedState })),
      };
    }

    const now = Date.now();
    const latest = await latestVersion(ctx, workspace._id);
    let number = Math.max(workspace.latestVersion, latest?.number ?? 0);
    let lastVersionAt = latest?.createdAt ?? 0;
    let lastVersionFiles: File[] = latest?.files ?? [];

    const overwritesOtherEdit = changed.some((f) => {
      const existing = byName.get(f.name);
      return existing !== undefined && revisionOf(existing) !== f.baseRevision;
    });
    if (overwritesOtherEdit && !sameFiles(current, lastVersionFiles)) {
      number += 1;
      lastVersionFiles = snapshot(current);
      lastVersionAt = now;
      await ctx.db.insert("workVersions", {
        workspaceId: workspace._id,
        number,
        files: lastVersionFiles,
        createdBy: userId,
        createdAt: now,
        reason: admin ? "teacher" : "autosave",
      });
    }

    const revisions = new Map<string, number>();
    for (const file of incoming) {
      const existing = byName.get(file.name);
      if (existing === undefined) {
        const revision = file.baseRevision + 1;
        await ctx.db.insert("workFiles", {
          workspaceId: workspace._id,
          name: file.name,
          content: file.content,
          updatedAt: now,
          updatedBy: userId,
          revision,
          sharedState: file.sharedState,
        });
        revisions.set(file.name, revision);
      } else if (existing.content !== file.content || !equalBytes(existing.sharedState, file.sharedState)) {
        const revision = revisionOf(existing) + 1;
        await ctx.db.patch("workFiles", existing._id, {
          content: file.content,
          updatedAt: now,
          updatedBy: userId,
          revision,
          sharedState: file.sharedState,
        });
        revisions.set(file.name, revision);
      } else {
        revisions.set(file.name, revisionOf(existing));
      }
    }

    const savedFiles = snapshot([...after].map(([name, content]) => ({ name, content })));
    if ((admin || now - lastVersionAt >= CHECKPOINT_MS) && !sameFiles(savedFiles, lastVersionFiles)) {
      number += 1;
      await ctx.db.insert("workVersions", {
        workspaceId: workspace._id,
        number,
        files: savedFiles,
        createdBy: userId,
        createdAt: now,
        reason: admin ? "teacher" : "autosave",
      });
    }
    await ctx.db.patch("workspaces", workspace._id, { updatedAt: now, latestVersion: number });
    if (admin) await recordAdminChange(ctx, { actorId: userId, table: "workspaces", recordId: workspace._id, summary: "Edited shared student files", after: { files: changed.map(f => f.name), version: number } });
    return {
      savedAt: now,
      files: incoming.map((f) => ({ name: f.name, revision: revisions.get(f.name)!, sharedState: f.sharedState })),
    };
  },
});

/** Version history, newest first, without file contents. */
export const versions = query({
  args: { workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(versionSummaryValidator),
  handler: async (ctx, args) => {
    const { student, workspace } = await requireOwnWorkspace(ctx, args.workspaceId);
    const result = await ctx.db
      .query("workVersions")
      .withIndex("by_workspaceId_and_number", (q) => q.eq("workspaceId", workspace._id))
      .order("desc")
      .paginate(args.paginationOpts);
    const authorName = authorNamer(ctx, student);
    const page = [];
    for (const version of result.page) {
      page.push({
        number: version.number,
        createdAt: version.createdAt,
        reason: version.reason,
        restoredFrom: version.restoredFrom ?? null,
        by: await authorName(version.createdBy),
        fileNames: version.files.map((f) => f.name),
      });
    }
    return { ...result, page };
  },
});

/** One version with its files, for inspecting before a restore. */
export const version = query({
  args: { workspaceId: v.id("workspaces"), number: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      number: v.number(),
      createdAt: v.number(),
      reason: versionReasonValidator,
      restoredFrom: v.union(v.number(), v.null()),
      by: v.string(),
      files: v.array(fileValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const { student, workspace } = await requireOwnWorkspace(ctx, args.workspaceId);
    const found = await ctx.db
      .query("workVersions")
      .withIndex("by_workspaceId_and_number", (q) =>
        q.eq("workspaceId", workspace._id).eq("number", args.number),
      )
      .unique();
    if (found === null) return null;
    return {
      number: found.number,
      createdAt: found.createdAt,
      reason: found.reason,
      restoredFrom: found.restoredFrom ?? null,
      by: await authorNamer(ctx, student)(found.createdBy),
      files: found.files,
    };
  },
});

/**
 * Makes an earlier version the working copy. Nothing is deleted: unsaved-to-
 * history work is kept as a version first, and the restore itself is a new
 * version that records which one it came from.
 */
export const restore = mutation({
  args: { workspaceId: v.id("workspaces"), number: v.number() },
  returns: v.object({ number: v.number() }),
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireOwnWorkspace(ctx, args.workspaceId);
    await writableClass(ctx, workspace.group);
    const target = await ctx.db
      .query("workVersions")
      .withIndex("by_workspaceId_and_number", (q) =>
        q.eq("workspaceId", workspace._id).eq("number", args.number),
      )
      .unique();
    if (target === null) throw appError("NOT_FOUND", "Version not found.");

    const now = Date.now();
    const current = await workingFiles(ctx, workspace._id);
    const latest = await latestVersion(ctx, workspace._id);
    let number = Math.max(workspace.latestVersion, latest?.number ?? 0);
    if (!sameFiles(current, latest?.files ?? [])) {
      number += 1;
      await ctx.db.insert("workVersions", {
        workspaceId: workspace._id,
        number,
        files: snapshot(current),
        createdBy: userId,
        createdAt: now,
        reason: "autosave",
      });
    }

    const restored = new Map(target.files.map((f) => [f.name, f.content]));
    for (const file of current) {
      const content = restored.get(file.name);
      if (content === undefined) {
        await ctx.db.delete("workFiles", file._id);
      } else if (content !== file.content) {
        await ctx.db.patch("workFiles", file._id, {
          content,
          updatedAt: now,
          updatedBy: userId,
          revision: revisionOf(file) + 1,
          sharedState: (() => { const doc = sharedDocument(file.content, file.sharedState); replaceSharedText(doc, content); return sharedBytes(doc); })(),
        });
      }
    }
    const existing = new Set(current.map((f) => f.name));
    for (const file of target.files) {
      if (existing.has(file.name)) continue;
      await ctx.db.insert("workFiles", {
        workspaceId: workspace._id,
        name: file.name,
        content: file.content,
        updatedAt: now,
        updatedBy: userId,
        revision: 1,
      });
    }

    number += 1;
    await ctx.db.insert("workVersions", {
      workspaceId: workspace._id,
      number,
      files: snapshot(target.files),
      createdBy: userId,
      createdAt: now,
      reason: "restore",
      restoredFrom: target.number,
    });
    await ctx.db.patch("workspaces", workspace._id, { latestVersion: number, updatedAt: now });
    return { number };
  },
});

/**
 * Records the Python packages this workspace installs before each run, so
 * reopening it (or restarting Python) brings them back.
 */
export const setPackages = mutation({
  args: { workspaceId: v.id("workspaces"), packages: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const { workspace } = await requireOwnWorkspace(ctx, args.workspaceId);
    await writableClass(ctx, workspace.group);
    const packages = args.packages.map((p) => p.trim()).filter((p) => p.length > 0);
    if (packages.length > MAX_PACKAGES) {
      throw appError("INVALID", `A workspace can use at most ${MAX_PACKAGES} packages.`);
    }
    const seen = new Set<string>();
    for (const spec of packages) {
      const problem = packageSpecProblem(spec);
      if (problem !== null) throw appError("INVALID", `${spec}: ${problem}`);
      const key = packageKey(spec);
      if (seen.has(key)) throw appError("INVALID", `${spec.split("==")[0]} is listed twice.`);
      seen.add(key);
    }
    await ctx.db.patch("workspaces", workspace._id, { packages });
    return packages;
  },
});

function equalBytes(a: ArrayBuffer | undefined, b: ArrayBuffer) {
  if (!a || a.byteLength !== b.byteLength) return false;
  const left = new Uint8Array(a), right = new Uint8Array(b);
  return left.every((value, i) => value === right[i]);
}
