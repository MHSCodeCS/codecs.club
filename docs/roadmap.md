# Implementation Roadmap

[Documentation index](README.md). Updated **October 27, 2026**. This orders the agreed features into phases. It adds no new scope; feature rules stay in the other guides.

The visual reference is the Claude Design project **CodeCS Basic v2**, saved at [`design/CodeCS Basic v2.dc.html`](../design/CodeCS%20Basic%20v2.dc.html) (10 screens at 1366×768, light and dark). `support.js` and `image-slot.js` from that project are design-tool runtime only and are not part of the app.

## Phase 1 — Structure and sign-in (built)

| Area | What exists |
| --- | --- |
| Design system | Design tokens (mint palette, status colors, syntax colors) in `app/globals.css`; Open Sauce Sans + Geist Mono; light/dark/auto theme without a flash |
| Shared UI | `components/ui/*`: buttons, fields, segmented controls, tabs, pills, status labels, callouts, loading/empty/error states, read-only syntax-colored `CodeView` |
| Routes | Login `/`; student `/learn`, `/learn/days/[dayId]`, `/learn/work`, `/learn/assignments/[assignmentId]`; admin `/admin/students`, `/curriculum`, `/assignments`, `/assignments/[assignmentId]`, `/assistance`, `/review`, `/settings`, `/history` |
| Backend | Full Convex schema (`convex/schema.ts`), role checks (`convex/lib/access.ts`), login-code allocation, time-zone helpers, admin change history, seed of the design's sample school |
| Sign-in | Convex Auth: student login code (`ConvexCredentials`, rate-limited) and admin username/password (`Password`, sign-up refused; accounts created with `admins:createAdmin`) |
| Live screens | Learning home, Lesson day, Admin Students (roster, attendance, group/curriculum/login-code changes), Admin Curriculum (timeline, day content, lesson dates), Settings (read-only), History |
| Preview screens | Assistance renders sample data from `lib/fixtures.ts` behind a visible “Preview” banner; nothing on them is saved (My work went live in Phase 2, the Workspace in Phase 3, Review in Phase 6, assignment authoring in Phase 7) |
| Tests | `npm test`: login codes, sign-in round trips, student/admin access refusals, reassignment history, lesson time zones, partial rule |

## Phase 2 — Student path, live (built)

| Area | What exists |
| --- | --- |
| My work | `/learn/work` reads `convex/myWork.ts`, with no fixtures or Preview banner. Saved work is grouped by original year, group and curriculum, labeled current or previous, and paginated with Load more work |
| Progress | Live saved timestamps and latest turn-in/review state, plus working-copy resume/open links; turn-in never closes |
| History | Paginated submission attempts, submitted version/time, superseded/waiting/reviewed states, guided-check outcomes and student-visible feedback with author; private notes never leave the backend |
| Submitted versions | View attempt opens the immutable submitted files, with file switching and read-only code. The separate working-copy link resumes editing |
| Past curricula | Students retain access to their own saved work after curriculum/group changes and across years. Workspace headers show original year/group/curriculum; historical lesson navigation returns to My work |
| Verification | Typecheck and changed-file lint pass; 102 tests pass, including ownership refusals, pagination, historical access after reassignment, feedback visibility and immutable snapshots. Backend synced to local deployment `local-code_cs-app`; production unchanged. Browser visual verification remains pending |

## Phase 3 — Editor and persistence (built)

| Area | What exists |
| --- | --- |
| Editor | CodeMirror 6 (`components/workspace/CodeEditor.tsx`) with Python highlighting, 4-space indent, bracket matching/closing, search and undo per file; theme from the design's `--k/--f/--s/--n/--c/--o` and `--code-*` tokens (`editorTheme.ts`), dark by default via `.scheme-dark` |
| Workspace screen | `/learn/assignments/[assignmentId]` is live: task and expected output, file tabs, Files and Versions panels, turn-in state and attempt count. Run, Stop, Packages, Check, Turn in and Ask for help render disabled (“Not available yet”) for Phases 4–6 and 9 |
| Files | Add (`+`, name checked as you type it), switch, upload (`.py/.txt/.csv/.json`, confirm before replacing) and download the shown file. Limits: 20 files, 100 KB per file, 400 KB per workspace (`convex/lib/workFiles.ts`, enforced on both sides) |
| Backend | `convex/workspaces.ts`: `get` (task + working copy), `open` (creates the workspace from the published starter files as v1), `saveFiles` (autosave; per-file revisions), `versions` (paginated), `version`, `restore`. Students only, caller derived from the session, someone else's workspace reads as not found, drafts and other curricula never open (a student's own past work still does) |
| Autosave | `lib/workspaceSync.ts`: 0.8 s debounce, at most 4 s during continuous typing, one save in flight. Header shows Saving… / ✓ Saved / Offline · changes kept / Save failed · Retry; “Saved” only after the mutation resolves. Failed saves keep the edits and retry with backoff (2 s doubling to 30 s) and on reconnect; invalid saves wait for the next edit. Saves on tab hide and when leaving; full page unloads with unsaved work trigger the browser warning; in-app links wait for a running save or ask when offline/failed |
| Versions | A version is added at most every 2 minutes while saving, plus v1 starter code. Restore first snapshots unsaved-to-history work, then adds a `restore` version recording `restoredFrom`; nothing is deleted. A save over a change made in another tab keeps that change as a version first |
| Schema | Additive only: `workFiles.revision` (optional), `workVersions.reason` gains `"start"`, `workVersions.restoredFrom` (optional) |
| Tests | `npm test`: workspace ownership refusals (save/versions/version/restore), drafts and other curricula refused, starter copy as v1, checkpoint spacing, restore keeps history, cross-tab overwrite kept in history, file rules; autosave engine states, retry, offline, echo/merge rules |

## Phase 4 — Python runtime (built)

| Area | What exists |
| --- | --- |
| Runtime | Pyodide **314.0.7** (Python 3.14.2) in a module Web Worker (`lib/python/python.worker.ts`). The core is self-hosted from `public/pyodide/314.0.7/` (copied from the npm package); optional packages load on demand from the matching jsDelivr release. Python starts loading when a workspace opens and is shared by every workspace in the tab |
| Build | `scripts/prepare-python.mjs` (runs before `dev`/`build`, or `npm run python:build`) copies the runtime and bundles the worker with esbuild to `public/python/worker.js`. Next's bundler starts workers as classic scripts, which Pyodide refuses |
| Run | Runs `main.py` if present, else the shown `.py` file, using the editor's current text. Each run starts from a fresh namespace with exactly the workspace's files on disk, so edited modules reload and deleted files disappear. Tracebacks hide runner frames and show `main.py`-relative file names |
| Stop | Site-wide `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless` give the worker shared memory. Stop writes SIGINT to the interrupt buffer; if Python hasn’t stopped within 2 s (or the page isn’t isolated) the worker is restarted and the output says variables were cleared. Files are never affected |
| input() | Blocks the worker on a shared buffer; the Output panel shows an input line, echoes the typed text after the prompt, and Stop cancels the wait. Without isolation, input() prints a clear message and gets no input |
| Output | Batched in the worker (every 50 ms or 16 KB), at most 2 MB forwarded per run; the panel keeps the newest 200 KB and says when output was trimmed or the limit was reached. Errors in coral, typed input in mint; footer shows Running / Finished / Stopped with an error / Stopped after N s |
| Packages | Packages popover installs with micropip; failures are explained (compiled code not available, not found, offline). Installed packages are saved on the workspace (`workspaces.packages`, `workspaces.setPackages`) and reinstalled before runs after a restart. Pyodide-built packages imported by the code (e.g. numpy) load on demand. Package progress shows in its own status line, not in program output |
| Schema | Additive only: `workspaces.packages` (optional string array) |
| Tests | `npm test`: real Pyodide in Node (output, module reload, fresh runs, tracebacks, syntax errors, input(), exit codes, interrupting an infinite loop, the default lesson modules), output batching and trimming, runtime client Stop/restart/input/load-failure paths with a fake worker, package-list ownership and validation |

## Phase 5 — Guided evaluation (built)

| Area | What exists |
| --- | --- |
| Rules | `convex/lib/evaluation.ts`: whitespace-insensitive begins / contains in order / ends / equals, readable reasons for unmet parts, completion / partial (assignment minimum) / no completion, outcome explanations. Shared by Convex and the UI (`lib/evaluation.ts` re-exports it) |
| Loop observation | `lib/python/runner.ts`: with the infinite-loop check on, loop bodies get counters (also in imported workspace files); outermost loops stop after 1,000 rounds as a planned stop (`"limit"`), never an error |
| Check flow | Run check (guided only) saves, calls `checks.prepare` (pins the saved files as a version; adds a “Checked” version only when needed), runs in check mode (check input fed to `input()`, 10 s limit, printed output captured), then `checks.record` evaluates on the server against the published revision and stores parts, outcome, run outcome and the start of the output |
| Check panel | Latest result with “for vN · time”, met / not yet with reasons, the overall explanation, notes for error / loop limit / timeout, and a stale notice when the code or task changed since |
| Schema | Additive only: `workVersions.reason` gains `"check"`; `checkResults.runOutcome`, `output`, `outputTruncated`; `assignmentRevisions.checkInput` |
| Seed | Countdown's first part is now `begins "10"` (so the design's count-by-2 bug is partial); Forever greeter and Mad libs get check input. Existing deployments keep their seeded parts |
| Tests | Evaluation rules incl. the design's examples; loop observation with real Pyodide (exactly 1,000 rounds, rounds not lines, nested and silent loops, imported modules, line numbers kept, no counters left for normal runs); runtime check capture/limit/timeout/stop; Convex check flow (version pinning and reuse, server evaluation, stale after edits, loop input, open-ended / other student / foreign version / changed task refused) |

## Phase 6 — Turn-in and review (built)

| Area | What exists |
| --- | --- |
| Turn in | The workspace card saves first (a failed save never reports success), then `submissions.turnIn` pins the saved working copy: it reuses the latest version when the files are unchanged, otherwise adds a version with reason `submit`, and records the next attempt. Guided turn-ins carry the latest check of exactly those files (`checkResultId`); otherwise review says “Not checked” |
| Retries | The card sends an idempotency key per Turn in click and keeps it until Convex answers, so a retry after a dropped connection returns the attempt already made. A key from someone else's work is refused without revealing anything |
| No cutoff | Built with a server-side cutoff (14 days after the lesson, 11:59 pm Pacific); removed on October 28, 2026 (D13): turn-in never closes |
| Resubmitting (D09) | Turning in again before review adds an attempt and marks the earlier unreviewed one `superseded`: it stays visible to admins but leaves the queue and the Review badge. Only the latest attempt can be reviewed |
| Turn-in card | Not turned in / Turned in, attempt number, version and time, waiting for review or “Reviewed by … · date” (the admin's first name), and the latest student-visible feedback with the attempt it was written on. Copy: “Sends your last saved version (vN). You can keep editing after.” (`submissions.forWorkspace`) |
| Review screen | `/admin/review` is live for the selected group's newest curriculum: Day and Assignment pickers with waiting counts; a queue with one row per student (New attempt = an earlier attempt was reviewed, Unreviewed, Reviewed, Not turned in) with time and outcome; attempt tabs; the read-only submitted snapshot (file tabs when there are several); Expected vs Actual words compared (missing words mint, differing words coral); the check parts; “Not checked” when there is no result; “Open live working copy” links to Assistance for now |
| Writing | Optional student-visible feedback and a private admin-only note (`feedback.visibility` `student` / `private`, D07). Mark reviewed saves both and sets `status`, `reviewedBy`, `reviewedAt`; on a reviewed attempt the button becomes Save changes (empty text removes a note; the review time is kept). Each review is recorded in History without the writing itself. Next → moves to the next waiting student |
| Where feedback shows | Learning home's latest feedback card (`student.home`, student-visible only) and the workspace turn-in card. Private notes are only returned by admin queries |
| Schema | Additive only: `submissions.status` gains `"superseded"`. `workspaces.get` no longer returns `turnIn` (the card reads `submissions.forWorkspace`) |
| Tests | `convex-test`: idempotent retry, turn-in accepted months after the lesson and on unscheduled days, snapshot unchanged after later edits and a restore, guided turn-ins carry the matching check, resubmission supersedes (badge and queue count once), queue states, feedback visible to the student while the private note never is (card, home, history), admin-only review (student and anonymous refused), another student's work refused; word comparison for Expected vs Actual (a “…” in the expected output is never marked) |

## Club corrections — October 28, 2026 (built)

Product corrections from the club (decisions D13–D17), applied across code, seed, tests and docs.

| Area | What changed |
| --- | --- |
| Turn-in never locks (D13) | The server-side cutoff is gone from `submissions.turnIn`; no due date, “closes”/“closed”/“closing tonight” text or late label anywhere (workspace card, lesson day, learning home, day track, My work). Curriculum's timeline shows lessons only (no turn-in bars); Review has no cutoff reminder; Settings shows the school year and time zone only. Lesson dates stay, and changing one moves only the lesson date (D06) |
| No assigned seating (D14) | Assistance replaces the seating chart with the class listed by last name; the help queue (longest wait first), online/idle/offline counts and the selected-student panel stay. The seed and fixtures have no seats |
| No staff role word, no titles (D15) | Student-facing names are the admin's first name (`convex/lib/adminNames.ts`: “Max reviewed this”, “Note from Max”, version authors). `admins:createAdmin` refuses a display name that starts with a title; `admins:setDisplayName` renames an admin. UI copy, docs, comments and component variants (now `Button`/`StatusLabel` `admin` and `CodeView` cursor tone `admin`) no longer use the old role word; the stored `workVersions.reason` literal `"teacher"` stays and reads “Edited together” |
| 6-week program (D16) | Python Fundamentals has 6 days; Functions folded into Day 6 “Lists and functions” (Day 5 Loops / Countdown and Jordan's history unchanged) |
| Admin on phones (D17) | Every `/admin/*` screen works at 375 px with no sideways page scroll and ~44 px touch targets; a compact top bar with a Menu below 1280 px; tables stack into cards; the student drawer, Assistance's selected student and Review's attempt open as full-screen sheets (`components/ui/PhoneSheet.tsx`); Curriculum has a phone Day picker and lists assignments first. The 1366×768 layout is unchanged. Breakpoints: [UI design](ui-design.md#responsive-breakpoints). The login page also works on a phone |
| Schema | Removed fields kept optional and marked deprecated so stored documents validate: `lessonSchedules.turnInClosesAt`, `settings.turnInDays`, `settings.closeTime`, `students.seatIndex`. `seed:applyCorrections` updates an older dev deployment in place (see [deployment](deployment.md#updating-a-deployment-seeded-before-october-28-2026)) |
| Tests | Turn-in accepted months after the lesson and on unscheduled days; admin first names and title refusal; the seed has 6 days and no seats; `applyCorrections` trims an older 8-day seed without losing work and is idempotent |

## Phase 7 — Admin content (built locally)

| Area | What exists |
| --- | --- |
| Assignment editor | `/admin/assignments` selects a real lesson; `/admin/assignments/[assignmentId]` edits the saved assignment. Curriculum's New assignment link carries the chosen day. No fixtures or Preview banner |
| Drafts/publication | Save draft appends a private revision. A published assignment keeps its published title, type, instructions and checks until Publish to lesson is used. Publication is immediate for students assigned to that curriculum |
| Content | Guided and open-ended tasks, title, summary, instructions with inline preview, expected output, starter file add/edit/upload/remove, named output checks, per-assignment partial minimum, loop observation and check input. Open-ended work starts from a blank main.py |
| Revisions | Each save creates an immutable revision with author/time. Paginated history can inspect an older revision and load it into the editor as an unsaved draft. Conflicting edits from another tab are refused. Unsaved edits warn on page unload and editor assignment navigation |
| Published edits | Explicit publication updates task/check definitions; existing student files, submitted versions and check results are preserved. New starters apply only to new workspaces; old checks become stale without automatic re-evaluation |
| Covers | Admin-only upload, replacement and removal in Curriculum; PNG/JPEG/WebP/GIF up to 5 MB, enforced on both sides. Storage ids are persisted and URLs resolved for lesson pages; removed/replaced files are retained rather than deleting potentially shared assets |
| Verification | 106 tests pass, including draft visibility, publication, edit conflicts, preserved student work/checks/submissions, open-ended blank starters, validation and cover authorization. Typecheck, changed-file lint and production build pass; local catalog and upload endpoint verified. The build initially stopped at Next.js's security notice and passed on retry; a framework security upgrade remains recommended. Browser visual verification remains pending; production unchanged |

## Phase 8 — Admin students (built locally)

| Area | What exists |
| --- | --- |
| Approved intake | D03 resolved: CSV exports with mapped first name, last name and optional existing login-code columns; up to 100 students / 1 MB per batch |
| Preview | Explicit new-student choice per row; returning students matched only by existing login code. Shows existing identity/group/curriculum, proposed names/codes, same-name warnings and per-row errors before committing |
| Commit | Admin-only, atomic import; wrong-group curricula, invalid names, duplicate returning identities and unknown codes refused. Revalidates the preview to refuse intervening roster changes. Retry receipts prevent duplicate identities/history after a dropped response |
| Preservation | Returning rows retain student/user identity, login code, since-year, avatar, saved work and submissions; names and target group/curriculum update. Same-name new people remain separate |
| Tickets | Group tickets and individual reprints use saved names/codes. Preview includes an editable website address and print / save PDF; cuttable cards include sign-in instructions and exclude navigation |
| History | Changed students record actor/time and before/after values in the same transaction. Unchanged imports and successful retries do not duplicate change history; existing student-edit and attendance history remains intact |
| Verification | 116 tests pass, including import authorization, identity/work preservation, code collisions, validation rollback, duplicate matches, stale previews, idempotent retries, history and CSV parsing. Typecheck, changed-file lint and production build pass; the build required an unsandboxed retry and displayed Next.js's existing security-upgrade notice. Browser visual verification deferred at the owner's request. Backend synced to local development; production unchanged |

## Later phases

Each phase is its own piece of work. Screens move off fixtures as their phase lands; the fixture shapes already match the planned query results.

| Phase | Scope | Blocked on |
| --- | --- | --- |
| 2. Student path, live | Built (see above); verified against the local backend on October 27, 2026 | — |
| 3. Editor and persistence | Built (see above); checked live against the dev deployment on October 15, 2026 | — |
| 4. Python runtime | Built (see above); checked live against the dev deployment on October 15, 2026. Still needs Chromebook/school-network tests | V01–V03 device tests |
| 5. Guided evaluation | Built (see above); checked live against the dev deployment on October 15, 2026 | — |
| 6. Turn-in and review | Built (see above); checked live against the dev deployment on October 15–16, 2026 (student and admin) | — |
| 7. Admin content | Built locally (see above); current publication behavior documented, with future release gating/re-evaluation changes still tracked as D04/D08 | — |
| 8. Admin students | Built locally (see above); D03 approved October 27, 2026 | — |
| 9. Assistance | Presence (online/idle/offline); help requests and queue; seat assignment; join/leave notifications; collaborative editing with labeled cursors; guidance notes; attributed remote Run | V04, V05 |
| 10. Hardening and release | Settings editing; authorization audit; accessibility pass; Chromebook and school-network tests; 50-active-student load check; hosting and domain | D02, D12, V02, V09, V10, V12 |
