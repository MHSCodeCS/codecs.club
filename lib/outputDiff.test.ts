import { describe, expect, test } from "vitest";
import { diffOutputs } from "./outputDiff";

const unmatched = (words: Array<{ text: string; matched: boolean }>) =>
  words.filter((w) => !w.matched).map((w) => w.text);

describe("output comparison", () => {
  test("marks the design's missing “!” on both sides", () => {
    const result = diffOutputs("10\n9\n8\n7\n6\n5\n4\n3\n2\n1\nLiftoff!\n", "10\n9\n8\n7\n6\n5\n4\n3\n2\n1\nLiftoff\n");
    expect(result.compared).toBe(true);
    expect(unmatched(result.expected)).toEqual(["Liftoff!"]);
    expect(unmatched(result.actual)).toEqual(["Liftoff"]);
  });

  test("spacing and line breaks don't count", () => {
    const result = diffOutputs("Hi, I'm Jordan", "Hi,\n  I'm   Jordan\n");
    expect(unmatched(result.expected)).toEqual([]);
    expect(unmatched(result.actual)).toEqual([]);
  });

  test("skipped and extra words are marked", () => {
    const result = diffOutputs("10 9 8 7 Liftoff!", "10 8 6 Liftoff!");
    expect(unmatched(result.expected)).toEqual(["9", "7"]);
    expect(unmatched(result.actual)).toEqual(["6"]);
  });

  test("a shortened expected output doesn't mark its “…”", () => {
    const result = diffOutputs("10\n9\n8\n…\n1\nLiftoff!", "10\n8\n6\n4\n2\nLiftoff!\n");
    expect(unmatched(result.expected)).toEqual(["9", "1"]);
    expect(unmatched(result.actual)).toEqual(["6", "4", "2"]);
  });

  test("very long output is shown without marks", () => {
    const result = diffOutputs("x ".repeat(3000), "y ".repeat(3000));
    expect(result.compared).toBe(false);
    expect(result.actual).toHaveLength(3000);
    expect(unmatched(result.actual)).toEqual([]);
  });
});
