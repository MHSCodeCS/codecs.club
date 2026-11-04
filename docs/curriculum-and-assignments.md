# Curriculum, Assignments, and Review

[Documentation index](README.md). This guide owns evaluation/submission rules; student and admin guides describe their interaction flows.

## Content and scheduling

Basic and advanced are permanent groups. Curricula contain ordered topic days with slides and assignments. Guided work supports lesson exercises; open-ended blank-file work supports projects and finals. Reassignment preserves student identity and history. Dates/times are supplied for each year without overwriting historical schedules. Drafts stay private; published assignments belong to the intended curriculum day.

Each day has a cover image shown on its lesson page and a link to slides made in Canva or Figma Slides (D01). Admins upload the cover on Curriculum; it is stored in Convex file storage (PNG, JPEG, WebP or GIF, up to 5 MB, checked again on the server, and the old file is deleted when it is replaced or removed). The slides link must be an https URL. Admins add days to a curriculum, move them earlier or later (days renumber), and remove a day only while it has no assignments and no attendance.

A lesson day opens to students on its lesson date, from the start of that date in the school time zone (D04). Before then it shows on the track as upcoming with the date it opens, but neither the day nor its assignments can be opened; a day with no date this school year isn't open. A student who already has work on a day keeps it open even if its date later moves into the future or is cleared (D13: no lockouts). Admins always see every day.

## Guided evaluation

Check behavior/output rather than equality with a model source-code solution. Each assignment defines meaningful named requirements, checks associated with those requirements, and a minimum for partial completion.

| Outcome | Rule |
| --- | --- |
| Completion | All required parts meet their checks |
| Partial completion | Some parts remain unmet, but the assignment-specific minimum for meaningful work is met |
| No completion | Successful work is below that minimum, even if a small part passes |

- No universal percentage applies to every assignment.
- Multiple checks for a small requirement must not disproportionately influence the result.
- Validate that partial rules are attainable and consistent with full completion.
- Show passed/unmet requirements and explain the overall outcome to students and admins.
- Explicit rules determine results; no AI judge or numerical grades are required.
- Open-ended projects do not require guided checks and receive feedback from an admin.

### Output normalization

Ignore spaces, tabs, and line breaks while preserving non-whitespace content and order. Preserve original formatting in the console. This agreed rule can equate differently spaced strings; it is not token-aware comparison or source-code equality.

Implemented part kinds (`convex/lib/evaluation.ts`), all on the output with whitespace removed from both sides:

| Kind | Met when |
| --- | --- |
| Output begins with | the output starts with the expected text |
| Output contains, in order | the expected text appears as one unbroken run anywhere in the output (other output may come before or after it) |
| Output ends with | the output ends with the expected text |
| Output equals | the output is exactly the expected text |

Unmet parts carry a reason built from the expected text's words and the printed word at the first difference, e.g. “expected “9” after “10”, got “8””, “expected the output to end with “Liftoff!”, got “Liftoff””, or “your program printed nothing”.

### Infinite-loop checks

Observe up to **1,000 loop iterations** and compare expected repeated output. An intentional stop at the observation limit must not make matching work incorrect. Preserve code/output and distinguish checking stops from execution errors.

Iterations, output lines, and characters are different measures. One loop body may print zero, one, or multiple lines. Do not substitute a line cap for the agreed iteration limit.

Implemented for assignments with the infinite-loop check on: the check compiles the student's files with a counter at the start of every loop body (including loops in imported workspace files). Each **outermost** loop (not inside another loop in the same function) stops the program when it begins round 1,001, so exactly 1,000 rounds finish; finite inner loops inside an endless loop never stop it early. The run ends as “stopped on purpose”, which is not an error, and the output so far is evaluated. Rounds are counted, not lines (tested with two prints per round, nested loops and silent loops). With the check on, every outermost loop is limited to 1,000 rounds, so it should only be enabled for endless-loop exercises.

Bounded observation cannot prove arbitrary code runs forever. Straightforward loop patterns may be recognized where behavior can be established; universal infinite-loop verification is not promised. Output matching is sufficient for the intended learning workflow.

### Running a check

- The program runs in the student's browser (Phase 4 runtime). Convex first pins the saved working copy as a version (reusing the latest version when nothing changed, otherwise adding a “Checked” version), then evaluates the printed output against the assignment's **published** parts and stores the result with that version and revision. Printed output only (not errors) is evaluated; up to 20,000 characters are kept on the result for review.
- `input()` reads the assignment's check input one line per call (`assignmentRevisions.checkInput`), then empty lines; checks never wait for typing.
- A check run is stopped after **10 seconds**; parts are then evaluated against the output so far and the result says the program didn't finish. Programs that end with an error are evaluated the same way and say so.
- A result is shown as stale (and dimmed) when the code changed after it, including unsaved edits, or when a newer task version was published since; then it is also labeled “older task version” and keeps the result and rules it had (D08). Stopping a check yourself records nothing.
- No anti-cheating is attempted; output matching is the agreed rule.

## Independent states

| Dimension | Meaning |
| --- | --- |
| Work progress | Not started / in progress; evaluation remains separate |
| Save | Saving / saved / failed or disconnected |
| Execution | Ready / running / stopped / succeeded / failed |
| Guided evaluation | Complete / partial / no completion for a particular work/check version |
| Review lifecycle | Submitted -> reviewed and returned -> revised -> resubmitted |
| Turn-in eligibility | Always open (D13); there is no cutoff |

Run success does not imply completion; completion does not imply submission. A newly submitted attempt does not inherit an earlier attempt's reviewed state. Editing checked code makes the old result historical rather than current.

## Submission and return

- Autosave preserves a working copy; Turn in creates a preserved snapshot only after the relevant files save successfully.
- Later edits, admin changes, restores, and reassignment cannot mutate a submitted snapshot.
- After review and return, students can edit/resubmit for complete, partial, or no-completion outcomes, at any time.
- Each attempt preserves snapshot, time, applicable results, and feedback. Admins see every submission and return.
- Save failures cannot produce successful submission messages; retries must not create duplicate attempts.
- Turning in again before an earlier attempt is reviewed is allowed (D09): it adds an attempt, an admin reviews the latest, and the earlier unreviewed attempt stays visible to admins (`superseded`) but leaves the review queue.
- An attempt carries the guided check of exactly its files when one exists; otherwise review shows it as not checked. Written feedback is optional and student-visible; a private note is admin-only (D07).

## Dates and published edits

The basic program, Python Fundamentals, runs **6 weeks** with one lesson a week, so it has 6 days (D16). Lesson dates and times are in the school time zone, America/Los_Angeles (Pacific); unscheduled days show “Not scheduled”. Turn-in never closes (D13, which supersedes the old 14-day window of D05): there is no due date, “late” label or closing warning, and the backend accepts a turn-in at any time. Changing a lesson date moves only the lesson date (D06).

### Drafts, publishing and task versions (D08)

An assignment's content (title, type, summary, instructions, expected output, starter files, parts, partial rule, loop check and check input) lives in revisions (`assignmentRevisions`). Admins edit a draft; Save draft keeps it in the current revision, which is edited in place only while it has never been published. Publishing makes the current revision the one students see and numbers it as the next task version (1, 2, 3, …). A published revision never changes again: the next save after publishing starts a new draft revision, so students keep seeing the published version until the next publish.

- Earlier checks and turn-ins keep the revision they were judged with. Each check stores its `revisionId`; each turn-in stores the published `revisionId` at the time (attempts from before October 28, 2026 fall back to their check's revision, or to the time the task was last published). They are labeled as an older task version in the student's check results, on the turn-in card and in Review, where the check and expected output are the ones the attempt was judged with.
- New checks always use the latest published rules. Nothing is re-evaluated automatically.
- Students' existing files are never touched. Starter files are copied once, when a student first opens the assignment, so a starter-file change only affects workspaces created later. Open-ended work starts from a blank `main.py`.
- Unpublishing hides the assignment from lesson days; students who started keep their workspace and can still edit, check (against the last published version) and turn in. Only a draft that no student has opened can be removed.
- Saving is refused when someone else saved the draft after the editor loaded, so two admins can't silently overwrite each other.
- Drafts are validated on the server: title up to 80 characters, summary 160, instructions and expected output 5,000, at most 20 parts (name 80, expected text 2,000), partial minimum between 0 and the number of parts, check input up to 2,000 characters and 100 lines, at most 10 starter files (workspace file-name rules, 100 KB together). Publishing also needs instructions and, for guided work, named parts with expected text and a reachable partial rule.

## Acceptance criteria

- Appropriate guided/project content opens in the correct student/curriculum context.
- Whitespace-only differences cannot lower completion; partial results follow the assignment rule.
- Loop checks finish within the observation rule without freezing the UI.
- Submitted snapshots survive edits, restores, reassignment, and resubmission.
- Every review/result belongs to the version actually reviewed/checked.
- Turn-in and turn-in again are accepted long after the lesson and on unscheduled days.
- A day and its assignments open on the lesson date; earlier work on a day keeps it open.
- Publishing an edit never changes a student's files or an earlier check or turn-in, and labels them as an older task version.

These are implementation checks; see the [verification register](decisions-and-verification.md) for the evidence recorded so far.
