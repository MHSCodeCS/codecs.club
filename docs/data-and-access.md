# Data, Identity, and Access

[Documentation index](README.md). Convex Cloud is connected for development, but application tables, functions, and authentication are not implemented.

## Persistence and conceptual data relationships

Convex is the required persistent backend. This is a conceptual model, not a committed table schema or a claim that the integration is implemented.

Cloud development configuration is connected; application schema and authentication remain unimplemented. See [deployment evidence](deployment.md).

| Record | Responsibility |
| --- | --- |
| Student | Persistent identity, name code, imported roster data, current group/curriculum |
| Admin | Username, credential hash/authentication records, and authorized teaching/management access |
| Group | The two persistent values: basic and advanced |
| Curriculum / Day | Learning sequence, topics, slides, assignment relationships |
| Lesson Schedule | Year-specific lesson dates and associated turn-in timing |
| App Settings | Admin-editable approved behavior, including turn-in timing configuration |
| Assignment | Guided/open-ended task, publication state, named requirements, expected checks, and assignment-specific partial-completion rule where applicable |
| Student Work | Student files, autosave state, environment details, assignment and historical context |
| Work Version | Recoverable prior files with creator/time context |
| Submission | Final saved snapshot, submission time, assignment/schedule context |
| Guided Check Result | Requirement-level outcomes and overall classification tied to the specific work version and evaluation-rule version |
| Feedback | Teacher response tied to reviewed work |
| Review Note | Admin-authored note associated with student work or review |
| Help Request | Student, assignment, alert and resolution state |
| Assistance / Guidance | Teacher participation and assignment-context messages |
| Attendance | Student attendance for group and lesson/date |
| Admin Change | Acting admin, timestamp, affected record, and relevant prior/new values |

Persistence requirements:

- References use stable student identity, not the student's changeable current curriculum.
- Current group/curriculum and historical assignment context are separate so reassignment cannot relabel old work.
- New yearly schedules cannot overwrite old submissions, work versions, or dates.
- Saved results must identify the code version checked; stale results must not imply that new edits have been evaluated.
- Concurrent teacher/student edits and restores must converge without silent data loss.
- Completed work and former-student access persist for the website's lifetime.
- Admin change history is required. A custom database/file backup feature or separate backup system is outside the approved scope.
- Retain the approved name-code student login flow for this small-scale deployment; changing it to a password-based student flow is not required.

## Identity and persistence invariants

- Use stable internal student IDs for work relationships, not the login code or current group.
- First-initial-plus-last-name codes receive numeric suffixes for collisions across current and former students in both groups. Preserve issued codes across years unless explicitly changed by an admin.
- Roster name matches alone must not silently merge people. Decide a stable import match key before importing returning students.
- Validate student ownership and admin privileges at backend entry points, not only through navigation.
- Autosave acknowledgment means persistence succeeded; pending edits and concurrent revisions need explicit reconciliation.
- Turn-in uses saved snapshots. Retry must not duplicate submission attempts; later edits cannot mutate prior snapshots.
- Results identify code and evaluation-rule versions; feedback identifies the submission reviewed.
- Admin changes record actor, time, affected records, and relevant prior/new values, excluding passwords/secrets.
- App authentication is separate from the developer CLI/MCP account. Credentials are hashed, and the chosen auth/session integration must match the implemented ownership checks.
- Define how text files, uploaded assets, and slides use database records versus Convex file storage during implementation. Validate access before exposing protected files.

See [pending decisions](decisions-and-verification.md) for roster matching, account recovery, notes, and versioned assignment editing. No custom backup system is included; required version history and admin change history are separate behaviors.

## Official implementation references

[Authentication](https://docs.convex.dev/auth/overview), [password configuration](https://labs.convex.dev/auth/config/passwords), [password hashing](https://labs.convex.dev/auth/api_reference/providers/Password), [file storage](https://docs.convex.dev/file-storage/overview).

Read `convex/_generated/ai/guidelines.md` before writing Convex code. Generated SDK/guidance files are not an implemented schema. Recheck auth-library compatibility with the installed versions before integration.
