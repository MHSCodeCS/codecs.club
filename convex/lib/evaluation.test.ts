import { describe, expect, test } from "vitest";
import { classify, evaluate, evaluatePart, explainOutcome, type Part } from "./evaluation";

const countdown: Part[] = [
  { name: "Counts down from 10", kind: "begins", expected: "10" },
  { name: "Reaches every number down to 1", kind: "containsInOrder", expected: "10 9 8 7 6 5 4 3 2 1" },
  { name: "Ends with Liftoff!", kind: "ends", expected: "Liftoff!" },
];

describe("guided checks", () => {
  test("a correct countdown completes regardless of spacing", () => {
    const output = "10\n9\n8\n7\n6\n5\n4\n3\n2\n1\nLiftoff!\n";
    expect(evaluate(countdown, 2, output).outcome).toBe("complete");
    expect(evaluate(countdown, 2, "10 9 8 7 6 5 4 3 2 1   Liftoff!").outcome).toBe("complete");
    expect(evaluate(countdown, 2, "10\t9\n\n8 7 6 5 4 3 2 1 Lift off!").outcome).toBe("complete");
  });

  test("the design's buggy countdown is partial, with the reason it shows", () => {
    // count = count - 2 prints 10 8 6 4 2 then Liftoff!
    const result = evaluate(countdown, 2, "10\n8\n6\n4\n2\nLiftoff!\n");
    expect(result.outcome).toBe("partial");
    expect(result.parts.map((p) => p.met)).toEqual([true, false, true]);
    expect(result.parts[1]!.detail).toBe("expected “9” after “10”, got “8”");
    expect(evaluatePart({ name: "x", kind: "begins", expected: "10 9" }, "10\n8\n").detail).toBe(
      "expected “9” after “10”, got “8”",
    );
  });

  test("a missing “!” fails only the ending, which is partial with a minimum of 2", () => {
    const result = evaluate(countdown, 2, "10 9 8 7 6 5 4 3 2 1\nLiftoff\n");
    expect(result.outcome).toBe("partial");
    expect(result.parts[2]!.detail).toBe("expected the output to end with “Liftoff!”, got “Liftoff”");
  });

  test("whitespace inside the expected text is ignored too", () => {
    expect(evaluatePart({ name: "x", kind: "equals", expected: "Hi,  Ada" }, "Hi, Ada\n").met).toBe(true);
    expect(evaluatePart({ name: "x", kind: "equals", expected: "Hi, Ada" }, "Hi,\nAda").met).toBe(true);
  });

  test("equals explains extra output", () => {
    const result = evaluatePart({ name: "x", kind: "equals", expected: "Done!" }, "Done!\nbonus\n");
    expect(result).toMatchObject({ met: false, detail: "extra output after “Done!”: “bonus”" });
  });

  test("an empty program and a missing first value are explained", () => {
    expect(evaluatePart(countdown[0]!, "")).toMatchObject({ met: false, detail: "your program printed nothing" });
    expect(evaluatePart(countdown[1]!, "Liftoff!").detail).toBe("couldn’t find “10” in the output");
    expect(evaluatePart({ name: "x", kind: "begins", expected: "10 9" }, "10").detail).toBe(
      "expected “9” after “10”, but the output ended",
    );
  });

  test("contains finds the expected run anywhere, with output around it", () => {
    const part: Part = { name: "Greets again and again", kind: "containsInOrder", expected: "Hello, Ada Hello, Ada" };
    expect(evaluatePart(part, "Name? Hello, Ada\nHello, Ada\nHello, Ada\n").met).toBe(true);
  });
});

describe("classification", () => {
  test("completion needs every part; partial needs the assignment's minimum", () => {
    expect(classify(3, 3, 2)).toBe("complete");
    expect(classify(2, 3, 2)).toBe("partial");
    expect(classify(1, 3, 2)).toBe("none");
    // A minimum equal to the total would be completion, never partial.
    expect(classify(2, 3, 3)).toBe("none");
    expect(classify(0, 1, 0)).toBe("none");
    expect(classify(1, 1, 0)).toBe("complete");
  });

  test("explanations match the outcome", () => {
    expect(explainOutcome("partial", 2, 3, 2)).toBe("2 of 3 parts met, enough for partial. Fix the last part for completion.");
    expect(explainOutcome("none", 1, 3, 2)).toBe("1 of 3 parts met. Partial needs 2.");
    expect(explainOutcome("complete", 3, 3, 2)).toBe("All 3 parts met.");
  });
});
