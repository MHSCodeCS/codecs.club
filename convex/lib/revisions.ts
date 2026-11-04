import type { Doc, Id } from "../_generated/dataModel";
import type { DraftContent } from "./assignmentRules";

/**
 * Task versions (D08, decided October 28, 2026). Each publish of edited
 * content is a new revision; earlier checks and turn-ins keep the revision
 * they were judged with and read as an older task version. Students' files
 * are never touched and nothing is re-evaluated.
 */

/** The task version a revision was published as. Seeded rows predate numbering: 1. */
export function taskVersion(revision: Doc<"assignmentRevisions">): number {
  return revision.version ?? 1;
}

/** Whether this revision has ever been published (and so may never change). */
export function wasPublished(
  revision: Doc<"assignmentRevisions">,
  assignment: Doc<"assignments">,
): boolean {
  return (
    revision.publishedAt !== undefined ||
    revision.version !== undefined ||
    assignment.publishedRevisionId === revision._id
  );
}

/** A revision as editor content; seeded rows take title and type from the assignment. */
export function revisionContent(
  revision: Doc<"assignmentRevisions">,
  assignment: Doc<"assignments">,
): DraftContent {
  return {
    title: revision.title ?? assignment.title,
    type: revision.type ?? assignment.type,
    summary: revision.summary,
    instructions: revision.instructions,
    expectedOutput: revision.expectedOutput ?? "",
    starterFiles: revision.starterFiles,
    parts: revision.parts,
    partialMin: revision.partialMin,
    loopCheck: revision.loopCheck,
    checkInput: revision.checkInput ?? "",
  };
}

/**
 * Whether work judged at `at` with `revisionId` (null for attempts turned in
 * before revisions were recorded) used an older task than the published one.
 */
export function olderTask(
  published: Doc<"assignmentRevisions"> | null,
  revisionId: Id<"assignmentRevisions"> | null,
  at: number,
): boolean {
  if (published === null) return false;
  if (revisionId !== null) return revisionId !== published._id;
  // Legacy attempt: older only if the task was republished after it.
  return published.publishedAt !== undefined && at < published.publishedAt;
}
