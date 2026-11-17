import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvex } from "./test.setup";

function as(t: ReturnType<typeof setupConvex>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

async function setup() {
  const t = setupConvex();
  await t.action(internal.admins.createAdmin, {
    username: "max",
    displayName: "Max",
    password: "correct-horse-battery",
  });
  await t.mutation(internal.seed.run, {});
  const student = async (loginCode: string) =>
    (await t.run((ctx) =>
      ctx.db
        .query("students")
        .withIndex("by_loginCode", (q) => q.eq("loginCode", loginCode))
        .unique(),
    ))!;
  const assignment = async (title: string) =>
    (await t.run(async (ctx) => {
      for await (const a of ctx.db.query("assignments")) if (a.title === title) return a._id;
      return null;
    }))!;
  return { t, jordan: await student("jsmith"), priya: await student("ppatel"), assignment };
}

/** Jordan's seeded Countdown workspace (v14, the count-by-2 bug). */
async function countdownWorkspace(t: ReturnType<typeof setupConvex>, studentId: Id<"students">, assignmentId: Id<"assignments">) {
  return (await t.run((ctx) =>
    ctx.db
      .query("workspaces")
      .withIndex("by_studentId_and_assignmentId", (q) => q.eq("studentId", studentId).eq("assignmentId", assignmentId))
      .unique(),
  ))!;
}

describe("guided checks", () => {
  test("a check pins the saved files and Convex evaluates the output", async () => {
    const { t, jordan, assignment } = await setup();
    const workspace = await countdownWorkspace(t, jordan._id, await assignment("Countdown"));
    const session = as(t, jordan.userId);

    const prep = await session.mutation(api.checks.prepare, { workspaceId: workspace._id });
    // The seeded working copy equals v14, so no new version is made.
    expect(prep.versionNumber).toBe(14);
    expect(prep.files.map((f) => f.name)).toEqual(["main.py"]);
    expect(prep.observeLoops).toBe(false);

    const result = await session.mutation(api.checks.record, {
      workspaceId: workspace._id,
      versionId: prep.versionId,
      revisionId: prep.revisionId,
      output: "10\n8\n6\n4\n2\nLiftoff!\n",
      outputTruncated: false,
      runOutcome: "ok",
    });
    expect(result.outcome).toBe("partial");
    expect(result.parts[1]).toMatchObject({ met: false, detail: "expected “9” after “10”, got “8”" });

    const latest = await session.query(api.checks.latest, { workspaceId: workspace._id });
    expect(latest).toMatchObject({ versionNumber: 14, outcome: "partial", fresh: true, currentTask: true, partialMin: 2 });

    // Editing the code makes the result stale until the next check.
    await session.mutation(api.workspaces.saveFiles, {
      workspaceId: workspace._id,
      files: [{ name: "main.py", content: "for n in range(10, 0, -1):\n    print(n)\nprint('Liftoff!')\n", baseRevision: 0 }],
    });
    expect((await session.query(api.checks.latest, { workspaceId: workspace._id }))?.fresh).toBe(false);

    // The next check pins the edited files as a new "check" version.
    const next = await session.mutation(api.checks.prepare, { workspaceId: workspace._id });
    expect(next.versionNumber).toBe(15);
    const version = await t.run((ctx) => ctx.db.get("workVersions", next.versionId));
    expect(version?.reason).toBe("check");
  });

  test("endless-loop exercises are observed and get their check input", async () => {
    const { t, jordan, assignment } = await setup();
    const session = as(t, jordan.userId);
    const workspaceId = await session.mutation(api.workspaces.open, { assignmentId: await assignment("Forever greeter") });
    const prep = await session.mutation(api.checks.prepare, { workspaceId });
    expect(prep.observeLoops).toBe(true);
    expect(prep.inputs).toEqual(["Ada"]);
    const result = await session.mutation(api.checks.record, {
      workspaceId,
      versionId: prep.versionId,
      revisionId: prep.revisionId,
      output: `Name? ${"Hello, Ada\n".repeat(1000)}`,
      outputTruncated: false,
      runOutcome: "limit",
    });
    expect(result.outcome).toBe("complete");
  });

  test("open-ended work, other students and mismatched versions or tasks are refused", async () => {
    const { t, jordan, priya, assignment } = await setup();
    const jordanSession = as(t, jordan.userId);
    const loopArt = await jordanSession.mutation(api.workspaces.open, { assignmentId: await assignment("Loop art") });
    await expect(jordanSession.mutation(api.checks.prepare, { workspaceId: loopArt })).rejects.toThrow(
      /no automatic check/,
    );

    const countdown = await assignment("Countdown");
    const jordanWorkspace = await countdownWorkspace(t, jordan._id, countdown);
    const priyaWorkspace = await countdownWorkspace(t, priya._id, countdown);
    await expect(
      as(t, priya.userId).mutation(api.checks.prepare, { workspaceId: jordanWorkspace._id }),
    ).rejects.toThrow(/not found/);

    const prep = await jordanSession.mutation(api.checks.prepare, { workspaceId: jordanWorkspace._id });
    const priyaPrep = await as(t, priya.userId).mutation(api.checks.prepare, { workspaceId: priyaWorkspace._id });
    // A version from someone else's workspace can't be used.
    await expect(
      jordanSession.mutation(api.checks.record, {
        workspaceId: jordanWorkspace._id,
        versionId: priyaPrep.versionId,
        revisionId: prep.revisionId,
        output: "",
        outputTruncated: false,
        runOutcome: "ok",
      }),
    ).rejects.toThrow(/version of your work/);
    // Results must use the task's current evaluation rules.
    const otherRevision = await t.run(async (ctx) => {
      const published = await ctx.db
        .query("assignmentRevisions")
        .withIndex("by_assignmentId", (q) => q.eq("assignmentId", countdown))
        .first();
      return await ctx.db.insert("assignmentRevisions", {
        assignmentId: published!.assignmentId,
        summary: published!.summary,
        instructions: published!.instructions,
        starterFiles: published!.starterFiles,
        parts: published!.parts,
        partialMin: 3,
        loopCheck: published!.loopCheck,
        createdBy: published!.createdBy,
        createdAt: Date.now(),
      });
    });
    await expect(
      jordanSession.mutation(api.checks.record, {
        workspaceId: jordanWorkspace._id,
        versionId: prep.versionId,
        revisionId: otherRevision,
        output: "",
        outputTruncated: false,
        runOutcome: "ok",
      }),
    ).rejects.toThrow(/task changed/);
  });
});
