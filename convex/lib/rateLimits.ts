import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  /** Attempts for one login code; slows guessing a specific student. */
  studentSignIn: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 10 },
  /** Unknown codes across the whole site; slows enumerating codes. */
  studentSignInFailure: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 60 },
});
