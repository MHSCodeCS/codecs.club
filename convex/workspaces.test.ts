import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_FILE_BYTES } from "./lib/workFiles";
import { setupConvex } from "./test.setup";
import { CHECKPOINT_MS } from "./workspaces";

function as(t: ReturnType<typeof setupConvex>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

async function setup() {
  const t = setupConvex();
  const adminUserId = await t.action(internal.admins.createAdmin, {
    username: "max",
    displayName: "Max",
    password: "correct-horse-battery",
  });
  await t.mutation(internal.seed.run, {});
  const byCode = (loginCode: string) =>
    t.run(async (ctx) =>
      ctx.db
        .query("students")
        .withIndex("by_loginCode", (q) => q.eq("loginCode", loginCode))
        .unique(),
    );
  const assignmentId = async (title: string) => {
    const found = await t.run(async (ctx) => {
      for await (const a of ctx.db.query("assignments")) if (a.title === title) return a._id;
      return null;
    });
    return found!;
  };
  const jordan = (await byCode("jsmith"))!;
  const priya = (await byCode("ppatel"))!;
  const ava = (await byCode("achen"))!;
  return { t, adminUserId, jordan, priya, ava, assignmentId };
}

const allVersions = (t: ReturnType<typeof setupConvex>, workspaceId: Id<"workspaces">) =>
  t.run((ctx) =>
    ctx.db
      .query("workVersions")
      .withIndex("by_workspaceId_and_number", (q) => q.eq("workspaceId", workspaceId))
      .take(100),
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("assignment workspace", () => {
  test("opening a published assignment copies the starter files into version 1", async () => {
    const { t, jordan, assignmentId } = await setup();
    const student = as(t, jordan.userId);
    const loopArt = await assignmentId("Loop art");

    const before = await student.query(api.workspaces.get, { assignmentId: loopArt });
    expect(before?.assignment.title).toBe("Loop art");
    expect(before?.workspace).toBeNull();

    const workspaceId = await student.mutation(api.workspaces.open, { assignmentId: loopArt });
    // Opening again returns the same workspace.
    expect(await student.mutation(api.workspaces.open, { assignmentId: loopArt })).toBe(workspaceId);

    const after = await student.query(api.workspaces.get, { assignmentId: loopArt });
    expect(after?.workspace?.files).toEqual([{ name: "main.py", content: "", revision: 1 }]);
    expect(after?.day).toMatchObject({ topic: "Loops", inCurrentCurriculum: true });
    const history = await student.query(api.workspaces.versions, {
      workspaceId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(history.page).toEqual([
      expect.objectContaining({ number: 1, reason: "start", by: "you", fileNames: ["main.py"] }),
    ]);
  });

  test("drafts can't be opened", async () => {
    const { t, jordan, assignmentId } = await setup();
    const student = as(t, jordan.userId);
    const draft = await assignmentId("Skip counter");
    expect(await student.query(api.workspaces.get, { assignmentId: draft })).toBeNull();
    await expect(student.mutation(api.workspaces.open, { assignmentId: draft })).rejects.toThrow(
      /isn’t available/,
    );
    expect(await student.query(api.workspaces.get, { assignmentId: "not-an-id" })).toBeNull();
  });

  test("other curricula can't be started, but a student's own past work still opens", async () => {
    const { t, jordan, ava, assignmentId } = await setup();
    const guessing = await assignmentId("Guessing game");
    const own = await as(t, jordan.userId).query(api.workspaces.get, { assignmentId: guessing });
    expect(own?.workspace?.files[0]?.content).toMatch(/random/);
    expect(own?.day.inCurrentCurriculum).toBe(false);

    const other = as(t, ava.userId);
    expect(await other.query(api.workspaces.get, { assignmentId: guessing })).toBeNull();
    await expect(other.mutation(api.workspaces.open, { assignmentId: guessing })).rejects.toThrow(
      /isn’t available/,
    );
  });

  test("a student can't open or save another student's workspace", async () => {
    const { t, adminUserId, jordan, priya, assignmentId } = await setup();
    const countdown = await assignmentId("Countdown");
    const priyaView = await as(t, priya.userId).query(api.workspaces.get, {
      assignmentId: countdown,
    });
    const priyaWorkspace = priyaView!.workspace!._id;

    // Opening by assignment always resolves to the caller's own workspace.
    const jordanView = await as(t, jordan.userId).query(api.workspaces.get, {
      assignmentId: countdown,
    });
    expect(jordanView?.workspace?._id).not.toBe(priyaWorkspace);

    const jordanSession = as(t, jordan.userId);
    await expect(
      jordanSession.mutation(api.workspaces.saveFiles, {
        workspaceId: priyaWorkspace,
        files: [{ name: "main.py", content: "print('mine now')", baseRevision: 0 }],
      }),
    ).rejects.toThrow(/Workspace not found/);
    await expect(
      jordanSession.query(api.workspaces.versions, {
        workspaceId: priyaWorkspace,
        paginationOpts: { numItems: 5, cursor: null },
      }),
    ).rejects.toThrow(/Workspace not found/);
    await expect(
      jordanSession.query(api.workspaces.version, { workspaceId: priyaWorkspace, number: 19 }),
    ).rejects.toThrow(/Workspace not found/);
    await expect(
      jordanSession.mutation(api.workspaces.restore, { workspaceId: priyaWorkspace, number: 19 }),
    ).rejects.toThrow(/Workspace not found/);
    await expect(
      t.mutation(api.workspaces.saveFiles, { workspaceId: priyaWorkspace, files: [] }),
    ).rejects.toThrow(/Sign in/);
    await expect(
      as(t, adminUserId).mutation(api.workspaces.saveFiles, {
        workspaceId: priyaWorkspace,
        files: [],
      }),
    ).rejects.toThrow(/Only students/);

    const files = await t.run((ctx) =>
      ctx.db
        .query("workFiles")
        .withIndex("by_workspaceId_and_name", (q) => q.eq("workspaceId", priyaWorkspace))
        .take(10),
    );
    expect(files.map((f) => f.content).join()).not.toMatch(/mine now/);
  });

  test("autosave updates the working copy and adds a version at most every checkpoint", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T23:00:00Z"));
    const { t, jordan, assignmentId } = await setup();
    const student = as(t, jordan.userId);
    const workspaceId = await student.mutation(api.workspaces.open, {
      assignmentId: await assignmentId("Loop art"),
    });

    const first = await student.mutation(api.workspaces.saveFiles, {
      workspaceId,
      files: [
        { name: "main.py", content: "for i in range(3):\n", baseRevision: 1 },
        { name: "art.txt", content: "***", baseRevision: 0 },
      ],
    });
    expect(first.files).toEqual([
      { name: "main.py", revision: 2 },
      { name: "art.txt", revision: 1 },
    ]);
    expect((await allVersions(t, workspaceId)).map((v) => v.number)).toEqual([1]);

    vi.setSystemTime(Date.now() + CHECKPOINT_MS);
    await student.mutation(api.workspaces.saveFiles, {
      workspaceId,
      files: [{ name: "main.py", content: "for i in range(3):\n    print('*')\n", baseRevision: 2 }],
    });
    const versions = await allVersions(t, workspaceId);
    expect(versions.map((v) => [v.number, v.reason])).toEqual([
      [1, "start"],
      [2, "autosave"],
    ]);
    expect(versions[1]!.files.map((f) => f.name)).toEqual(["main.py", "art.txt"]);

    const view = await student.query(api.workspaces.get, {
      assignmentId: await assignmentId("Loop art"),
    });
    expect(view?.workspace?.latestVersion).toBe(2);
    expect(view?.workspace?.files.map((f) => f.name)).toEqual(["main.py", "art.txt"]);
  });

  test("a save over a change made elsewhere keeps that change in history", async () => {
    const { t, jordan, assignmentId } = await setup();
    const student = as(t, jordan.userId);
    const workspaceId = await student.mutation(api.workspaces.open, {
      assignmentId: await assignmentId("Loop art"),
    });
    // Tab A saves; tab B, still based on revision 1, saves different text.
    await student.mutation(api.workspaces.saveFiles, {
      workspaceId,
      files: [{ name: "main.py", content: "tab A", baseRevision: 1 }],
    });
    await student.mutation(api.workspaces.saveFiles, {
      workspaceId,
      files: [{ name: "main.py", content: "tab B", baseRevision: 1 }],
    });
    const versions = await allVersions(t, workspaceId);
    expect(versions.some((v) => v.files[0]?.content === "tab A")).toBe(true);
  });

  test("restore creates a new version without deleting history", async () => {
    const { t, jordan, assignmentId } = await setup();
    const student = as(t, jordan.userId);
    const countdown = await assignmentId("Countdown");
    const view = await student.query(api.workspaces.get, { assignmentId: countdown });
    const workspaceId = view!.workspace!._id;
    expect(view!.workspace!.latestVersion).toBe(14);

    // Unsnapshotted edits since v14: a new file and a changed main.py.
    await student.mutation(api.workspaces.saveFiles, {
      workspaceId,
      files: [
        { name: "main.py", content: "print('rewrite')\n", baseRevision: 0 },
        { name: "helpers.py", content: "def blastoff():\n    pass\n", baseRevision: 0 },
      ],
    });
    const before = await allVersions(t, workspaceId);

    const result = await student.mutation(api.workspaces.restore, { workspaceId, number: 14 });
    expect(result.number).toBe(16);

    const after = await allVersions(t, workspaceId);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length).map((v) => [v.number, v.reason, v.restoredFrom])).toEqual([
      [15, "autosave", undefined],
      [16, "restore", 14],
    ]);
    // The pre-restore work is kept as v15.
    expect(after.find((v) => v.number === 15)!.files.map((f) => f.content)).toEqual([
      "print('rewrite')\n",
      "def blastoff():\n    pass\n",
    ]);

    const restored = await student.query(api.workspaces.get, { assignmentId: countdown });
    expect(restored?.workspace?.latestVersion).toBe(16);
    expect(restored?.workspace?.files.map((f) => f.name)).toEqual(["main.py"]);
    expect(restored?.workspace?.files[0]?.content).toMatch(/count = count - 2/);

    const inspected = await student.query(api.workspaces.version, { workspaceId, number: 16 });
    expect(inspected).toMatchObject({ reason: "restore", restoredFrom: 14, by: "you" });
  });

  test("file names, sizes and counts are checked on the server", async () => {
    const { t, jordan, assignmentId } = await setup();
    const student = as(t, jordan.userId);
    const workspaceId = await student.mutation(api.workspaces.open, {
      assignmentId: await assignmentId("Loop art"),
    });
    const save = (name: string, content = "") =>
      student.mutation(api.workspaces.saveFiles, {
        workspaceId,
        files: [{ name, content, baseRevision: 0 }],
      });
    await expect(save("../secret.py")).rejects.toThrow(/letters, numbers/);
    await expect(save("picture.png")).rejects.toThrow(/\.py, \.txt, \.csv or \.json/);
    await expect(save("Main.py")).rejects.toThrow(/already a file named main\.py/);
    await expect(save("big.txt", "x".repeat(MAX_FILE_BYTES + 1))).rejects.toThrow(/larger than/);
    await save("data.csv", "a,b\n1,2\n");
  });
});

describe("workspace packages", () => {
  test("a student records packages for their own workspace and get returns them", async () => {
    const { t, jordan, assignmentId } = await setup();
    const student = as(t, jordan.userId);
    const loopArt = await assignmentId("Loop art");
    const workspaceId = await student.mutation(api.workspaces.open, { assignmentId: loopArt });

    const saved = await student.mutation(api.workspaces.setPackages, {
      workspaceId,
      packages: [" emoji ", "art==6.4"],
    });
    expect(saved).toEqual(["emoji", "art==6.4"]);
    const data = await student.query(api.workspaces.get, { assignmentId: loopArt });
    expect(data?.workspace?.packages).toEqual(["emoji", "art==6.4"]);
  });

  test("bad names, duplicates and other students' workspaces are refused", async () => {
    const { t, jordan, priya, assignmentId } = await setup();
    const loopArt = await assignmentId("Loop art");
    const workspaceId = await as(t, jordan.userId).mutation(api.workspaces.open, {
      assignmentId: loopArt,
    });

    await expect(
      as(t, jordan.userId).mutation(api.workspaces.setPackages, {
        workspaceId,
        packages: ["emoji; rm -rf /"],
      }),
    ).rejects.toThrow(/package name/);
    await expect(
      as(t, jordan.userId).mutation(api.workspaces.setPackages, {
        workspaceId,
        packages: ["Emoji", "emoji==2.0"],
      }),
    ).rejects.toThrow(/listed twice/);
    await expect(
      as(t, priya.userId).mutation(api.workspaces.setPackages, { workspaceId, packages: ["emoji"] }),
    ).rejects.toThrow(/not found/);
  });
});
