import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Admins are the high school students who run the club. Students see an
 * admin's first name ("Max reviewed this"), never a role word or a title.
 */

/** Shown to students when the admin record is gone. */
const FALLBACK_NAME = "CodeCS";

const TITLE = /^(mr|mrs|ms|mx|miss|dr)\.?$/i;

/** True when a display name starts with a title such as "Ms." or "Mr". */
export function startsWithTitle(displayName: string): boolean {
  return TITLE.test(displayName.trim().split(/\s+/)[0] ?? "");
}

/** The first word of a display name, skipping a leading title left in old data. */
export function firstName(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const named = words[0] !== undefined && TITLE.test(words[0]) ? words.slice(1) : words;
  return named[0] ?? FALLBACK_NAME;
}

async function displayNameOf(ctx: Pick<QueryCtx, "db">, userId: Id<"users">) {
  const admin = await ctx.db
    .query("admins")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return admin?.displayName ?? null;
}

/** An admin's full display name, for admin screens. */
export async function adminName(ctx: Pick<QueryCtx, "db">, userId: Id<"users">): Promise<string> {
  return (await displayNameOf(ctx, userId)) ?? FALLBACK_NAME;
}

/** An admin's first name, for anything a student sees. */
export async function adminFirstName(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
): Promise<string> {
  const displayName = await displayNameOf(ctx, userId);
  return displayName === null ? FALLBACK_NAME : firstName(displayName);
}
