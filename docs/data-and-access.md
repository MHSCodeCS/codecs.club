# Data, Identity, and Access

[Documentation index](README.md). Updated October 28, 2026 (Phase 7). The schema (`convex/schema.ts`), authentication and the functions for Phases 1 and 3–7 are implemented in source; see the [roadmap](roadmap.md) for which features use them.

## Persistence and conceptual data relationships

Convex is the required persistent backend. The conceptual records below map to tables in `convex/schema.ts` (table names in the last column). Having a table does not mean the feature using it is built.

| Record | Responsibility | Table(s) |
| --- | --- | --- |
| Student | Persistent identity, name code, imported roster data, current group/curriculum | `students` (+ `users`) |
| Admin | Username, display name (students see its first word, never a title), credential hash/authentication records, and authorized teaching/management access | `admins` (+ `users`, Convex Auth tables) |
| Group | The two persistent values: basic and advanced | `"basic" \| "advanced"` field |
| Curriculum / Day | Learning sequence, topics, cover image (Convex file storage), slides link, assignment relationships | `curricula`, `days`, `_storage` |
| Lesson Schedule | Year-specific lesson dates; a day opens to students on its date (D04). Turn-in never closes, so there is no turn-in timing | `lessonSchedules` |
| School clock | Today's date in the school time zone, kept current by a cron so student queries can tell which days are open without reading the clock | `schoolClock` |
| App Settings | Admin-editable approved behavior: current school year and school time zone | `settings` |
| Assignment | Guided/open-ended task, publication state, order on its day, the current draft and the published revision | `assignments` |
| Assignment revision | One version of the task: title, type, summary, instructions, expected output, starter files, named parts, partial rule, loop check, check input; draft save time, and the task version number and publish time once published. Never edited after publishing (D08) | `assignmentRevisions` |
| Student Work | Student files, autosave state, environment details, assignment and historical context | `workspaces`, `workFiles` |
| Work Version | Recoverable prior files with creator/time context and why it was made (start, autosave, restore, check, …) | `workVersions` |
| Submission | Final saved snapshot, submission time, the task revision it was turned in under, assignment/schedule context | `submissions` |
| Guided Check Result | Requirement-level outcomes and overall classification tied to the specific work version and evaluation-rule version, plus how the check run ended and the start of its output | `checkResults` |
| Feedback | An admin's response tied to reviewed work (student-visible) | `feedback` (`visibility: "student"`) |
| Review Note | Admin-only note associated with student work or review | `feedback` (`visibility: "private"`) |
| Help Request | Student, assignment, alert and resolution state | `helpRequests` |
| Assistance / Guidance | Admin participation and assignment-context messages | `assistSessions`, `guidanceNotes` |
| Attendance | Present/Late/Absent per student per lesson date | `attendance` |
| Admin Change | Acting admin, timestamp, affected record, and relevant prior/new values | `adminChanges` |

Persistence requirements:

- References use stable student identity, not the student's changeable current curriculum.
- Current group/curriculum and historical assignment context are separate so reassignment cannot relabel old work.
- New yearly schedules cannot overwrite old submissions, work versions, or dates.
- Saved results must identify the code version checked; stale results must not imply that new edits have been evaluated.
- Results and turn-ins identify the task revision they were judged with (`checkResults.revisionId`, `submissions.revisionId`). A published revision is never edited; publishing an edit makes a new one, and nothing re-evaluates earlier work or changes students' files (D08).
- Concurrent admin/student edits and restores must converge without silent data loss.
- Fields that are no longer used stay in the schema as optional and are marked deprecated, because Convex refuses a schema that existing documents don't match: `lessonSchedules.turnInClosesAt`, `settings.turnInDays`, `settings.closeTime` (D13) and `students.seatIndex` (D14). `seed:applyCorrections` clears them on an older development deployment. The `workVersions.reason` literal `"teacher"` is kept as stored and means an edit made by an admin.
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
- App authentication is separate from the developer CLI/MCP account. It uses Convex Auth: students sign in with a login code (`ConvexCredentials` provider `student`, rate-limited per code and site-wide for unknown codes); admins sign in with username and password (`Password` provider, scrypt hash, public sign-up refused). Admin accounts are created with the internal `admins:createAdmin` function.
- Every public function derives the caller from the session (`convex/lib/access.ts`: `requireAdmin`, `requireStudent`) and never accepts an identity argument. Client route guards only choose what to render.
- Student workspace files (including uploaded `.py/.txt/.csv/.json`) are text rows in `workFiles`, with whole-workspace snapshots in `workVersions`; limits in `convex/lib/workFiles.ts` keep a snapshot under the 1 MiB document limit.
- Lesson cover images are the only binary files in Convex file storage. Only admins get an upload URL (`adminCurriculum.generateCoverUploadUrl`); `setCover` reads the stored file's type and size from `_storage` (PNG, JPEG, WebP or GIF, up to 5 MB, `convex/lib/covers.ts`), deletes a refused upload, refuses a file that is already another day's cover, and deletes the replaced cover; `removeCover` and removing a day delete it too. Students get a signed URL only for days open to them. The site's `Cross-Origin-Embedder-Policy: credentialless` lets these cross-origin images load without credentials.
- Student access to a lesson day (D04) is decided in `convex/lib/dayAccess.ts`: open from the start of its lesson date in the school time zone, or when the student already has a workspace on any of its assignments (D13 kept access). `student.home`, `student.day`, `workspaces.get` and `workspaces.open` apply it; checks and turn-ins act on the student's own workspace, which only exists on a day they could open. Queries take today's date from `schoolClock` (a cron in `convex/crons.ts` advances it every 10 minutes), so open pages update at midnight; mutations use the server clock. Admin functions never apply it.

See [pending decisions](decisions-and-verification.md) for roster matching and account recovery. No custom backup system is included; required version history and admin change history are separate behaviors.

## Official implementation references

[Authentication](https://docs.convex.dev/auth/overview), [password configuration](https://labs.convex.dev/auth/config/passwords), [password hashing](https://labs.convex.dev/auth/api_reference/providers/Password), [file storage](https://docs.convex.dev/file-storage/overview).

Read `convex/_generated/ai/guidelines.md` before writing Convex code. Recheck auth-library compatibility when upgrading `@convex-dev/auth` (0.0.96 as of October 15, 2026).
