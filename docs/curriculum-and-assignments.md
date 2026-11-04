# Curriculum, Assignments, and Review

[Documentation index](README.md). This guide owns evaluation/submission rules; student and admin guides describe their interaction flows.

## Content and scheduling

Basic and advanced are permanent groups. Curricula contain ordered topic days with slides and assignments. Guided work supports lesson exercises; open-ended blank-file work supports projects and finals. Reassignment preserves student identity and history. Dates/times are supplied for each year without overwriting historical schedules. Drafts stay private; published assignments belong to the intended curriculum day.

Each day has a cover image shown on its lesson page and a link to slides made in Canva or Figma Slides (D01). Future lesson release and effects of published edits are pending choices in the [decision register](decisions-and-verification.md).

## Live authoring (Phase 7)

In Curriculum, choose a day and use New assignment, or open Assignments and
choose a lesson. Save draft stores a private revision; Publish to lesson
makes that revision available immediately to students in the curriculum. For
published work, draft edits leave the published title, type, task and checks
unchanged. Revision history can inspect old content and load it into the
editor; saving it creates another revision rather than modifying history.
Concurrent edits are rejected so a stale tab cannot overwrite another save.

Guided assignments support a summary, instructions, expected output, editable
starter files, named output checks, partial minimum, loop observation and check
input. Publishing requires instructions and valid, nonempty guided checks.
Drafts can retain incomplete check configuration. File names and limits match
student workspaces (20 files, 100 KB each, 400 KB total). Open-ended projects
start with a blank main.py and no guided rules.

Publishing revised content updates tasks/checks explicitly; existing student
files and submitted versions are never replaced. New starter files apply only
to new workspaces. Historical checks retain their original revision and become
stale against a newly published task; no automatic re-evaluation is performed.
Additional release gating and alternative re-evaluation policies remain future
choices under D04/D08.

Lesson covers are uploaded, replaced or removed in Curriculum. PNG, JPEG, WebP
and GIF are supported up to 5 MB. Metadata and storage ids are validated on the
backend; the student lesson page resolves the stored image. Replaced images
are retained so shared/historical references are not silently deleted.

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
- A result is shown as stale (and dimmed) when the code changed after it, including unsaved edits, or when the published task changed. Stopping a check yourself records nothing.
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

Published instructions and checks can be edited, but previous files, snapshots, and results must not be silently overwritten. Results identify the code and evaluation definition used. Application of new content to existing work and re-evaluation remain explicit decisions.

## Acceptance criteria

- Appropriate guided/project content opens in the correct student/curriculum context.
- Whitespace-only differences cannot lower completion; partial results follow the assignment rule.
- Loop checks finish within the observation rule without freezing the UI.
- Submitted snapshots survive edits, restores, reassignment, and resubmission.
- Every review/result belongs to the version actually reviewed/checked.
- Turn-in and turn-in again are accepted long after the lesson and on unscheduled days.

These are future implementation checks, not passed tests.
