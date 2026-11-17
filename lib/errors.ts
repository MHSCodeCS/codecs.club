import { ConvexError } from "convex/values";

/** A readable message for errors thrown by Convex functions. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      if ("message" in data && typeof data.message === "string") return data.message;
      if ("kind" in data && data.kind === "RateLimited") {
        return "Too many tries. Wait a minute, then try again.";
      }
    }
  }
  return fallback;
}
