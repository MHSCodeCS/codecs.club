/**
 * Rules for assignment drafts, shared by the Convex authoring functions
 * (authoritative) and the admin editor (instant feedback). Saving a draft
 * checks shape and size only, so half-finished work can be kept; publishing
 * also needs a complete task. Limits keep a revision far below Convex's 1 MiB
 * document limit and starter files well inside a workspace's own limits.
 */
import { stripWhitespace, validatePartialRule, type PartKind } from "./evaluation";
import { byteLength, fileNameProblem } from "./workFiles";

export const MAX_TITLE_LENGTH = 80;
export const MAX_SUMMARY_LENGTH = 160;
export const MAX_INSTRUCTIONS_LENGTH = 5000;
export const MAX_EXPECTED_OUTPUT_LENGTH = 5000;
export const MAX_PARTS = 20;
export const MAX_PART_NAME_LENGTH = 80;
export const MAX_PART_EXPECTED_LENGTH = 2000;
export const MAX_CHECK_INPUT_LENGTH = 2000;
export const MAX_CHECK_INPUT_LINES = 100;
export const MAX_STARTER_FILES = 10;
export const MAX_STARTER_BYTES = 100_000;

export type DraftContent = {
  title: string;
  type: "guided" | "open";
  summary: string;
  instructions: string;
  /** "" when the task shows no expected output. */
  expectedOutput: string;
  starterFiles: Array<{ name: string; content: string }>;
  parts: Array<{ name: string; kind: PartKind; expected: string }>;
  partialMin: number;
  loopCheck: boolean;
  /** "" when checks feed no input. */
  checkInput: string;
};

const unixLines = (text: string) => text.replace(/\r\n?/g, "\n");

/** Trims names and normalizes line endings, so equal drafts compare equal. */
export function normalizeDraft(draft: DraftContent): DraftContent {
  return {
    title: draft.title.trim(),
    type: draft.type,
    summary: draft.summary.trim(),
    instructions: unixLines(draft.instructions).trimEnd(),
    expectedOutput: unixLines(draft.expectedOutput).trimEnd(),
    starterFiles: draft.starterFiles.map((f) => ({
      name: f.name.trim(),
      content: unixLines(f.content),
    })),
    parts: draft.parts.map((p) => ({
      name: p.name.trim(),
      kind: p.kind,
      expected: unixLines(p.expected).trim(),
    })),
    partialMin: draft.partialMin,
    loopCheck: draft.loopCheck,
    checkInput: unixLines(draft.checkInput).replace(/\n+$/, ""),
  };
}

/** Why a draft can't be saved (shape and size), or null. Expects a normalized draft. */
export function draftProblem(draft: DraftContent): string | null {
  if (draft.title.length === 0) return "Give the assignment a title.";
  if (draft.title.length > MAX_TITLE_LENGTH) {
    return `Keep the title under ${MAX_TITLE_LENGTH} characters.`;
  }
  if (draft.summary.length > MAX_SUMMARY_LENGTH) {
    return `Keep the summary under ${MAX_SUMMARY_LENGTH} characters.`;
  }
  if (draft.instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return `Keep the instructions under ${MAX_INSTRUCTIONS_LENGTH.toLocaleString("en-US")} characters.`;
  }
  if (draft.expectedOutput.length > MAX_EXPECTED_OUTPUT_LENGTH) {
    return `Keep the expected output under ${MAX_EXPECTED_OUTPUT_LENGTH.toLocaleString("en-US")} characters.`;
  }

  if (draft.starterFiles.length > MAX_STARTER_FILES) {
    return `An assignment can have at most ${MAX_STARTER_FILES} starter files.`;
  }
  const seen = new Set<string>();
  let starterBytes = 0;
  for (const file of draft.starterFiles) {
    const problem = fileNameProblem(file.name);
    if (problem !== null) return `${file.name || "A starter file"}: ${problem}`;
    const key = file.name.toLowerCase();
    if (seen.has(key)) return `There are two starter files named ${file.name}.`;
    seen.add(key);
    starterBytes += byteLength(file.content);
  }
  if (starterBytes > MAX_STARTER_BYTES) {
    return `Starter files together must stay under ${MAX_STARTER_BYTES / 1000} KB.`;
  }

  if (draft.parts.length > MAX_PARTS) return `An assignment can have at most ${MAX_PARTS} parts.`;
  for (const [i, part] of draft.parts.entries()) {
    if (part.name.length > MAX_PART_NAME_LENGTH) {
      return `Part ${i + 1}: keep the name under ${MAX_PART_NAME_LENGTH} characters.`;
    }
    if (part.expected.length > MAX_PART_EXPECTED_LENGTH) {
      return `Part ${i + 1}: keep the expected text under ${MAX_PART_EXPECTED_LENGTH.toLocaleString("en-US")} characters.`;
    }
  }
  if (
    !Number.isInteger(draft.partialMin) ||
    draft.partialMin < 0 ||
    draft.partialMin > draft.parts.length
  ) {
    return "Partial completion must need between 0 and all of the parts.";
  }

  if (draft.checkInput.length > MAX_CHECK_INPUT_LENGTH) {
    return `Keep the check input under ${MAX_CHECK_INPUT_LENGTH.toLocaleString("en-US")} characters.`;
  }
  if (draft.checkInput.split("\n").length > MAX_CHECK_INPUT_LINES) {
    return `Check input can have at most ${MAX_CHECK_INPUT_LINES} lines.`;
  }
  return null;
}

/** Why a draft can't be published yet, or null. Includes `draftProblem`. */
export function publishProblem(draft: DraftContent): string | null {
  const shape = draftProblem(draft);
  if (shape !== null) return shape;
  if (draft.instructions.trim().length === 0) return "Write the instructions before publishing.";
  if (draft.type === "open") return null;
  for (const [i, part] of draft.parts.entries()) {
    if (part.name.length === 0) return `Part ${i + 1} needs a name.`;
    if (stripWhitespace(part.expected).length === 0) {
      return `Part ${i + 1} (${part.name}) needs expected output to check for.`;
    }
  }
  const rule = validatePartialRule(draft.parts.length, draft.partialMin);
  return rule.ok ? null : rule.message;
}

/** Whether two normalized drafts are the same task. */
export function sameDraft(a: DraftContent, b: DraftContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Names of the fields that differ, for change history (never the contents). */
export function changedFields(before: DraftContent, after: DraftContent): string[] {
  return (Object.keys(after) as Array<keyof DraftContent>).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}
