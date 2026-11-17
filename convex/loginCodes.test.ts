import { describe, expect, test } from "vitest";
import { allocateLoginCode, baseLoginCode, normalizeLoginCode } from "./lib/loginCodes";
import { setupConvex } from "./test.setup";

describe("login codes", () => {
  test("base code is first initial plus last name, letters only", () => {
    expect(baseLoginCode("Jordan", "Smith")).toBe("jsmith");
    expect(baseLoginCode("Liam", "O’Brien")).toBe("lobrien");
    expect(baseLoginCode("José", "Núñez-Díaz")).toBe("jnunezdiaz");
  });

  test("typed codes are normalized", () => {
    expect(normalizeLoginCode("  JSmith1 ")).toBe("jsmith1");
    expect(normalizeLoginCode("j smith")).toBe("jsmith");
  });

  test("duplicates get the lowest free numeric suffix and issued codes are kept", async () => {
    const t = setupConvex();
    const codes = await t.run(async (ctx) => {
      const curriculumId = await ctx.db.insert("curricula", { name: "Python Fundamentals", group: "basic" });
      const add = async (first: string, last: string) => {
        const userId = await ctx.db.insert("users", { name: `${first} ${last}`, role: "student" });
        const loginCode = await allocateLoginCode(ctx, first, last);
        await ctx.db.insert("students", {
          userId,
          firstName: first,
          lastName: last,
          loginCode,
          group: "basic",
          curriculumId,
          sinceYear: "2026-27",
        });
        return loginCode;
      };
      const jordan = await add("Jordan", "Smith");
      const jamie = await add("Jamie", "Smith");
      const jess = await add("Jess", "Smith");
      return { jordan, jamie, jess };
    });
    expect(codes).toEqual({ jordan: "jsmith", jamie: "jsmith1", jess: "jsmith2" });
  });
});
