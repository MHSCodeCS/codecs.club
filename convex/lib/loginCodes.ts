import type { QueryCtx } from "../_generated/server";

/** Lowercases and strips everything except letters and digits. */
export function normalizeLoginCode(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** First initial plus last name, letters only: "Liam O'Brien" -> "lobrien". */
export function baseLoginCode(firstName: string, lastName: string): string {
  const letters = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  const base = letters(firstName).slice(0, 1) + letters(lastName);
  if (base.length === 0) throw new Error("A login code needs at least one letter.");
  return base;
}

/**
 * Picks the lowest free code: base, then base1, base2, … Codes are unique
 * across every student ever created (both groups, current and former), and
 * issued codes are never reassigned because students are never deleted.
 */
export async function allocateLoginCode(
  ctx: Pick<QueryCtx, "db">,
  firstName: string,
  lastName: string,
  reserved: ReadonlySet<string> = new Set(),
): Promise<string> {
  const base = baseLoginCode(firstName, lastName);
  for (let suffix = 0; suffix < 1000; suffix++) {
    const candidate = suffix === 0 ? base : `${base}${suffix}`;
    const taken = await ctx.db
      .query("students")
      .withIndex("by_loginCode", (q) => q.eq("loginCode", candidate))
      .first();
    if (taken === null && !reserved.has(candidate)) return candidate;
  }
  throw new Error(`No free login code for ${base}.`);
}
