import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { appError } from "./lib/errors";
import { normalizeLoginCode } from "./lib/loginCodes";
import { rateLimiter } from "./lib/rateLimits";

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    /**
     * Admin username + password. The username travels in the `email` param
     * because that is the account id the Password provider reads. Accounts are
     * provisioned with `admins:createAdmin`, so public sign-up is refused.
     */
    Password<DataModel>({
      profile(params) {
        if (params.flow !== "signIn") {
          throw appError("FORBIDDEN", "Admin accounts are created by an existing admin.");
        }
        const username = typeof params.email === "string" ? params.email : "";
        return { email: normalizeUsername(username) };
      },
    }),

    /** Student login code from the printed ticket. */
    ConvexCredentials<DataModel>({
      id: "student",
      authorize: async (credentials, ctx) => {
        const code =
          typeof credentials.code === "string" ? normalizeLoginCode(credentials.code) : "";
        if (code.length === 0) return null;
        await rateLimiter.limit(ctx, "studentSignIn", { key: code, throws: true });
        const userId = await ctx.runQuery(internal.students.userIdForLoginCode, {
          loginCode: code,
        });
        if (userId === null) {
          await rateLimiter.limit(ctx, "studentSignInFailure", { throws: true });
          return null;
        }
        return { userId };
      },
    }),
  ],
});
