# Curriculum, Assignments, and Review

[Documentation index](README.md). This guide owns evaluation/submission rules; student and admin guides describe their interaction flows.

## Content and scheduling

Basic and advanced are permanent groups. Curricula contain ordered topic days with slides and assignments. Guided work supports lesson exercises; open-ended blank-file work supports projects and finals. Reassignment preserves student identity and history. Dates/times are supplied for each year without overwriting historical schedules. Drafts stay private; published assignments belong to the intended curriculum day.

Slides may be authored in Figma or Google Slides. Delivery format, future lesson release, and effects of published edits are pending choices in the [decision register](decisions-and-verification.md).

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
- Open-ended projects do not require guided checks and receive teacher feedback.

### Output normalization

Ignore spaces, tabs, and line breaks while preserving non-whitespace content and order. Preserve original formatting in the console. This agreed rule can equate differently spaced strings; it is not token-aware comparison or source-code equality.

### Infinite-loop checks

Observe up to **1,000 loop iterations** and compare expected repeated output. An intentional stop at the observation limit must not make matching work incorrect. Preserve code/output and distinguish checking stops from execution errors.

Iterations, output lines, and characters are different measures. One loop body may print zero, one, or multiple lines. Do not substitute a line cap for the agreed iteration limit. Instrumentation for counting the intended loop, including nested loops, still needs verification.

Bounded observation cannot prove arbitrary code runs forever. Straightforward loop patterns may be recognized where behavior can be established; universal infinite-loop verification is not promised. Output matching is sufficient for the intended learning workflow.

## Independent states

| Dimension | Meaning |
| --- | --- |
| Work progress | Not started / in progress; evaluation remains separate |
| Save | Saving / saved / failed or disconnected |
| Execution | Ready / running / stopped / succeeded / failed |
| Guided evaluation | Complete / partial / no completion for a particular work/check version |
| Review lifecycle | Submitted -> reviewed and returned -> revised -> resubmitted |
| Turn-in eligibility | Open / closed by the configured cutoff |

Run success does not imply completion; completion does not imply submission. A newly submitted attempt does not inherit an earlier attempt's reviewed state. Editing checked code makes the old result historical rather than current.

## Submission and return

- Autosave preserves a working copy; Turn in creates a preserved snapshot only after the relevant files save successfully.
- Later edits, teacher changes, restores, and reassignment cannot mutate a submitted snapshot.
- After review and return, students can edit/resubmit for complete, partial, or no-completion outcomes, until the deadline.
- Each attempt preserves snapshot, time, applicable results, and feedback. Admins see every submission and return.
- Returning work does not bypass a closed cutoff. Admins can adjust the cutoff; editing/history/feedback remain accessible after closing.
- Save failures cannot produce successful submission messages; retries must not create duplicate attempts.
- Another submission before an earlier attempt is returned is not yet specified.

## Dates and published edits

Admins configure lesson-relative turn-in windows and closing times. Roughly two weeks is the requested direction, not a finalized default. Exact duration/time zone, unscheduled behavior, and date-change effects remain pending. Backend checks must enforce the cutoff, not only disable a button.

Published instructions and checks can be edited, but previous files, snapshots, and results must not be silently overwritten. Results identify the code and evaluation definition used. Application of new content to existing work and re-evaluation remain explicit decisions.

## Acceptance criteria

- Appropriate guided/project content opens in the correct student/curriculum context.
- Whitespace-only differences cannot lower completion; partial results follow the assignment rule.
- Loop checks finish within the observation rule without freezing the UI.
- Submitted snapshots survive edits, restores, reassignment, and resubmission.
- Every review/result belongs to the version actually reviewed/checked.
- Closed turn-in blocks initial/repeated submission without deleting work access.

These are future implementation checks, not passed tests.
