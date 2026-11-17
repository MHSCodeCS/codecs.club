import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { setAuthEnv, setupConvex } from "./test.setup";

beforeAll(setAuthEnv);

const ADMIN = { username: "max", displayName: "Max", password: "correct-horse-battery" };

async function seededBackend() {
  const t = setupConvex();
  await t.action(internal.admins.createAdmin, ADMIN);
  await t.mutation(internal.seed.run, {});
  return t;
}

describe("student sign-in", () => {
  test("a valid login code signs in as that student", async () => {
    const t = await seededBackend();
    const result = await t.action(api.auth.signIn, {
      provider: "student",
      params: { code: " JSmith " },
    });
    expect(result.tokens?.token).toBeTruthy();
    const expected = await t.query(internal.students.userIdForLoginCode, { loginCode: "jsmith" });
    expect(expected).not.toBeNull();
  });

  test("an unknown login code does not sign in", async () => {
    const t = await seededBackend();
    const result = await t.action(api.auth.signIn, {
      provider: "student",
      params: { code: "jsmth" },
    });
    expect(result.tokens ?? null).toBeNull();
  });
});

describe("admin sign-in", () => {
  test("the right username and password sign in", async () => {
    const t = await seededBackend();
    const result = await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signIn", email: "Max", password: ADMIN.password },
    });
    expect(result.tokens?.token).toBeTruthy();
  });

  test("a wrong password is rejected", async () => {
    const t = await seededBackend();
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signIn", email: "max", password: "not-the-password" },
      }),
    ).rejects.toThrow();
  });

  test("public admin sign-up is refused", async () => {
    const t = setupConvex();
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signUp", email: "intruder", password: "a-long-enough-password" },
      }),
    ).rejects.toThrow(/created by an existing admin/);
  });
});
