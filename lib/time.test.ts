import { describe, expect, test } from "vitest";
import { zonedParts, zonedTimeToUtc } from "../convex/lib/time";
import { validatePartialRule } from "./evaluation";

const timeZone = "America/Los_Angeles";

describe("lesson times", () => {
  test("a Pacific lesson time converts to UTC and back", () => {
    const lesson = zonedTimeToUtc({ year: 2026, month: 10, day: 15, hour: 16, minute: 0 }, timeZone);
    expect(new Date(lesson).toISOString()).toBe("2026-10-15T23:00:00.000Z");
    expect(zonedParts(lesson, timeZone)).toEqual({ year: 2026, month: 10, day: 15, hour: 16, minute: 0 });
  });

  test("uses standard time after the daylight-saving change", () => {
    // Nov 5 4:00 pm PST (after the Nov 1 change) = Nov 6 00:00 UTC.
    const lesson = zonedTimeToUtc({ year: 2026, month: 11, day: 5, hour: 16, minute: 0 }, timeZone);
    expect(new Date(lesson).toISOString()).toBe("2026-11-06T00:00:00.000Z");
  });
});

describe("partial rule", () => {
  test("needs fewer than all parts and at least one", () => {
    expect(validatePartialRule(3, 2).ok).toBe(true);
    expect(validatePartialRule(3, 3).ok).toBe(false);
    expect(validatePartialRule(3, 0).ok).toBe(false);
    expect(validatePartialRule(0, 0).ok).toBe(false);
  });
});
