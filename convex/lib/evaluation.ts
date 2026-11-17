/**
 * Guided-evaluation rules (docs/curriculum-and-assignments.md). Checks compare
 * a program's printed output with each named part of the assignment, ignoring
 * spaces, tabs and line breaks while keeping the order of everything else.
 * Shared by the Convex check functions (authoritative) and the UI.
 */
export type PartKind = "begins" | "containsInOrder" | "ends" | "equals";
export type Outcome = "complete" | "partial" | "none";
export type Part = { name: string; kind: PartKind; expected: string };
export type PartResult = { name: string; met: boolean; detail?: string };

export const partKindLabel: Record<PartKind, string> = {
  begins: "Output begins with",
  containsInOrder: "Output contains, in order",
  ends: "Output ends with",
  equals: "Output equals",
};

export function stripWhitespace(text: string): string {
  return text.replace(/\s+/g, "");
}

/** Whether a partial-completion minimum makes sense for this many parts. */
export function validatePartialRule(
  partCount: number,
  partialMin: number,
): { ok: true; message: string } | { ok: false; message: string } {
  if (partCount === 0) return { ok: false, message: "Add at least one part to check." };
  if (partCount === 1) {
    return { ok: true, message: "One part: the work is either complete or not." };
  }
  if (partialMin < 1) return { ok: false, message: "Partial completion needs at least 1 part." };
  if (partialMin >= partCount) {
    return {
      ok: false,
      message: `Partial must need fewer than all ${partCount} parts, or it equals completion.`,
    };
  }
  return { ok: true, message: `Reachable. Completion still needs all ${partCount}.` };
}

/**
 * Completion needs every part; partial needs the assignment's own minimum
 * (fewer than all); anything less is no completion, even if a part passed.
 */
export function classify(met: number, total: number, partialMin: number): Outcome {
  if (total > 0 && met === total) return "complete";
  if (total > 1 && partialMin >= 1 && partialMin < total && met >= partialMin) return "partial";
  return "none";
}

/** Output with whitespace removed, plus where each kept character came from. */
type Stripped = { text: string; origin: number[] };

function strip(text: string): Stripped {
  let out = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i]!)) {
      out += text[i];
      origin.push(i);
    }
  }
  return { text: out, origin };
}

/** The expected text's whitespace-separated pieces and where each starts once stripped. */
function pieces(expected: string): Array<{ text: string; start: number }> {
  const result: Array<{ text: string; start: number }> = [];
  let start = 0;
  for (const text of expected.split(/\s+/).filter(Boolean)) {
    result.push({ text, start });
    start += text.length;
  }
  return result;
}

const MAX_SHOWN = 24;
const quote = (text: string) =>
  `“${text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN - 1)}…` : text}”`;

/** The printed word (non-whitespace run) at a stripped output position. */
function wordAt(output: string, stripped: Stripped, index: number): string | null {
  const at = stripped.origin[index];
  if (at === undefined) return null;
  let start = at;
  let end = at;
  while (start > 0 && !/\s/.test(output[start - 1]!)) start--;
  while (end < output.length && !/\s/.test(output[end]!)) end++;
  return output.slice(start, end);
}

/**
 * Explains a mismatch at `expectedIndex` (a position in the stripped expected
 * text) against `outputIndex` in the stripped output, e.g.
 * "expected “9” after “10”, got “8”".
 */
function explainAt(
  expected: string,
  output: string,
  stripped: Stripped,
  expectedIndex: number,
  outputIndex: number,
): string {
  const parts = pieces(expected);
  let k = parts.findIndex((p) => expectedIndex < p.start + p.text.length);
  if (k === -1) k = parts.length - 1;
  const want = parts[k]!.text;
  const got = wordAt(output, stripped, outputIndex);
  const where = k === 0 ? "first" : `after ${quote(parts[k - 1]!.text)}`;
  if (got === null) {
    return k === 0
      ? `expected ${quote(want)}, but the output ended`
      : `expected ${quote(want)} ${where}, but the output ended`;
  }
  return k === 0 ? `expected ${quote(want)} first, got ${quote(got)}` : `expected ${quote(want)} ${where}, got ${quote(got)}`;
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Checks one part against the output and explains why it isn't met. */
export function evaluatePart(part: Part, output: string): PartResult {
  const want = stripWhitespace(part.expected);
  const got = strip(output);
  const result = (met: boolean, detail?: string): PartResult =>
    met ? { name: part.name, met } : { name: part.name, met, detail };
  if (want.length === 0) return result(true);
  if (got.text.length === 0) return result(false, "your program printed nothing");

  switch (part.kind) {
    case "begins": {
      const i = commonPrefix(want, got.text);
      if (i === want.length) return result(true);
      return result(false, explainAt(part.expected, output, got, i, i));
    }
    case "equals": {
      const i = commonPrefix(want, got.text);
      if (i === want.length && got.text.length === want.length) return result(true);
      if (i === want.length) {
        const extra = wordAt(output, got, i);
        const last = pieces(part.expected).at(-1)!.text;
        return result(false, `extra output after ${quote(last)}: ${quote(extra ?? "")}`);
      }
      return result(false, explainAt(part.expected, output, got, i, i));
    }
    case "ends": {
      if (got.text.endsWith(want)) return result(true);
      const last = pieces(part.expected).at(-1)!.text;
      const actual = wordAt(output, got, got.text.length - 1) ?? "";
      return result(false, `expected the output to end with ${quote(last)}, got ${quote(actual)}`);
    }
    case "containsInOrder": {
      if (got.text.includes(want)) return result(true);
      // Find the longest start of the expected text that does appear.
      let length = 0;
      let at = -1;
      const limit = Math.min(want.length, 2_000);
      while (length < limit) {
        const found = got.text.indexOf(want.slice(0, length + 1));
        if (found === -1) break;
        length += 1;
        at = found;
      }
      if (length === 0) {
        return result(false, `couldn’t find ${quote(pieces(part.expected)[0]!.text)} in the output`);
      }
      return result(false, explainAt(part.expected, output, got, length, at + length));
    }
  }
}

/** Evaluates every part and classifies the overall outcome. */
export function evaluate(
  parts: ReadonlyArray<Part>,
  partialMin: number,
  output: string,
): { outcome: Outcome; parts: PartResult[] } {
  const results = parts.map((part) => evaluatePart(part, output));
  const met = results.filter((r) => r.met).length;
  return { outcome: classify(met, parts.length, partialMin), parts: results };
}

/** One sentence explaining the overall outcome to the student. */
export function explainOutcome(outcome: Outcome, met: number, total: number, partialMin: number): string {
  if (outcome === "complete") return total === 1 ? "The part is met." : `All ${total} parts met.`;
  const left = total - met;
  if (outcome === "partial") {
    return `${met} of ${total} parts met, enough for partial. Fix the last ${left === 1 ? "part" : `${left} parts`} for completion.`;
  }
  if (total <= 1) return "The part isn’t met yet.";
  return `${met} of ${total} parts met. Partial needs ${partialMin}.`;
}
