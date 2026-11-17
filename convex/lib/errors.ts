import { ConvexError } from "convex/values";

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "CONFLICT";

export function appError(code: AppErrorCode, message: string) {
  return new ConvexError({ code, message });
}
