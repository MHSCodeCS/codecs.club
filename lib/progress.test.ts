import { expect, test } from "vitest";
import { assignmentColor, assignmentFill, type AssignmentProgress } from "./progress";
const base: AssignmentProgress = { _id: "a", title: "Task", type: "open", summary: "", started: false, savedAt: null, turnedIn: false, latestOutcome: null };
test("review decisions determine colors, while unreviewed work stays pending", () => {
  expect(assignmentColor(base)).toBe("amb");
  expect(assignmentColor({ ...base, turnedIn: true })).toBe("amb");
  expect(assignmentColor({ ...base, reviewed: true, reviewDecision: "complete" })).toBe("mint");
  expect(assignmentColor({ ...base, reviewed: true, reviewDecision: "needsWork" })).toBe("cor");
});
test("mixed statuses occupy equal thirds of the fill", () => {
  const fill = assignmentFill([{ ...base, reviewed: true, reviewDecision: "needsWork" }, base, { ...base, reviewed: true, reviewDecision: "complete" }]);
  expect(fill).toContain("var(--cor-i) 0%");
  expect(fill).toContain("var(--amb) 33.333333333333336%");
  expect(fill).toContain("var(--mint) 100%");
  expect(assignmentFill([])).toBeUndefined();
});
