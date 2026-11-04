# Decisions and Verification Register

[Documentation index](README.md). Updated October 27, 2026. These are unresolved choices and evidence gaps, not proposed additional features. The documentation describes agreed scope; it does not imply implementation readiness.

## Resolved

- Convex retained; cloud development/MCP access verified.
- Permanent basic/advanced groups and student identities; no classes/yearly accounts.
- Name codes with duplicate suffixes; explicit admin login changes allowed.
- Admin username/password login replaces Google sign-in.
- Browser Python first, lightweight beginner/advanced learning libraries, Chromebook constraints.
- Whitespace-insensitive checks, assignment-specific partial rules, up to 1,000 observed loop iterations.
- Direct admin entry with notification, simultaneous editing/named cursors, Run/guidance/help alerts.
- Return/edit/resubmit for any completion result at any time; all attempts remain visible.
- Admin change history included; separate backup system excluded.
- Managed hosting, no domain/frontend hosting; 50 concurrent/1,000 lifetime students.

Resolved on October 15, 2026 by approving the **CodeCS Basic v2** design ([`design/`](../design/CodeCS%20Basic%20v2.dc.html)):

| ID | Decision |
| --- | --- |
| D01 | Each day has a cover image shown on the lesson page and a slides link (Canva or Figma Slides) that opens in a new tab. Slides are presented live in class; students can reopen them anytime. No slide upload/embed. |
| D05 | **Superseded October 28, 2026** by D13 (turn-in never locks). It was: turn-in closes 14 days after the lesson date at 11:59 pm Pacific, with both values in Settings. The school time zone stays **America/Los_Angeles** (Pacific) for lesson dates; unscheduled days show “Not scheduled”. |
| D06 | A lesson-date change moves only the lesson date. |
| D07 | Written feedback is optional and student-visible; a separate private note is visible to admins only. |
| D10 | Mint palette with amber/coral/violet status colors (violet = an admin: joined, cursors, feedback), Open Sauce Sans with Geist Mono for code, light and dark themes, editor dark by default, designed for a 1366×768 Chromebook viewport. |
| D11 | Attendance is Present, Late or Absent per student per lesson date (the group’s lesson schedule), separate from online presence. |

Resolved on October 15, 2026 by the developer:

| ID | Decision |
| --- | --- |
| D09 | A student may turn in again before an earlier attempt is reviewed. Each turn-in adds an attempt; an admin reviews the latest. Earlier unreviewed attempts stay visible to admins (status `superseded`, shown as “replaced”) but leave the review queue and the Review badge. |

Resolved on October 28, 2026 by the club (the admins who run CodeCS are high school students teaching younger students):

| ID | Decision |
| --- | --- |
| D13 | Turn-in never locks. Students can turn in, and turn in again, at any time: there is no due date, no “late” label and no “closing tonight” warning. Lessons keep their dates. Replaces D05. The removed fields (`lessonSchedules.turnInClosesAt`, `settings.turnInDays`, `settings.closeTime`) stay in the schema as optional and unused so stored documents still validate. |
| D14 | No assigned seating. Assistance lists the class by last name with the help queue (longest wait first), online/idle/offline counts and the selected student; there is no seating chart. `students.seatIndex` is optional and unused. |
| D15 | Admins are the high school students who run the club, so the app never gives them a staff role word or a title. Student-facing copy uses the admin's first name (“Max reviewed this”, “Note from Max”); the admin area calls the role “admin”. Admin display names that start with a title are refused. The stored `workVersions.reason` literal `"teacher"` stays (renaming it would need a data migration) and reads as “Edited together”. |
| D16 | The basic program is **6 weeks**, one lesson a week: Python Fundamentals has 6 days, and Functions folded into Day 6 (“Lists and functions”). |
| D17 | The admin area works on phones (375 px wide) as well as the 1366×768 Chromebook layout, because admins look up assignments on their phones. Breakpoints are in [UI design](ui-design.md#responsive-breakpoints). The student side stays Chromebook-first; the login page also works on a phone. |

Resolved on October 27, 2026 by the project owner:

| ID | Decision |
| --- | --- |
| D03 | CSV exports with a header row; map first name, last name and optional existing login code. Returning students match by existing login code only; names never automatically merge identities. Every new student is explicitly marked new. Select the target group/curriculum, preview all rows and conflicts, then commit. |

## Product decisions requiring input

| ID | Decision | Needed before |
| --- | --- | --- |
| D02 | Forgotten-password recovery and in-app admin provisioning (interim: the developer creates admins with `npx convex run admins:createAdmin`) | Release |
| D04 | Future lessons available immediately versus admin release | Publication/student day list |
| D08 | Published edits applied to existing work and any re-evaluation | Versioned assignment publication |
| D12 | Frontend provider, domain choice, and account ownership | Release |

Do not silently invent approved defaults. Independent implementation work can proceed while the relevant decision remains pending.

## Engineering choices and evidence needed

| ID | Work item | Required evidence |
| --- | --- | --- |
| V01 | Browser runtime/package selection | Python fundamentals, lightweight modules, files/imports, repeated runs, compatible package installs. **Oct 15:** Pyodide 314.0.7 (Python 3.14.2) chosen and integrated; the default lesson modules, multi-file imports with reload, repeated fresh runs and a micropip install (`emoji`) pass on macOS (Node tests and a live browser check) |
| V02 | School device/network | Cold/repeated startup and runtime/database/package/slide access on actual school Chromebook/network |
| V03 | Stop and loop counting | Busy/infinite loops stop without UI freeze; nested loops and multiple/zero prints do not confuse iterations with lines. **Oct 15:** a printing infinite loop stopped by interrupt within 1 s in the browser with the page responsive; restart fallback unit-tested. **Oct 15 (Phase 5):** loop observation counts rounds, not lines: exactly 1,000 rounds for an endless greeter, 2,000 lines for two prints per round, 3,000 for a nested finite loop, silent loops and loops in imported files stop too (real Pyodide tests); a live check of the greeter stopped as planned |
| V04 | Collaboration/presence/restores | Two browsers converge; disconnects, concurrent edits/restores preserve work |
| V05 | Remote Run routing | Correct version/actor; explicit busy/offline/late-result behavior |
| V06 | Auth integration/access | Hashes/sessions; negative student/admin access tests; recovery consistent with D02. **Oct 15:** Convex Auth chosen (student `ConvexCredentials` + admin `Password`); sign-in round trips and refusals pass in `convex-test`; not yet exercised against the deployed backend |
| V07 | File/slide storage | Durable uploads/resume/download; appropriate ownership/access; actionable failures. **Oct 15:** workspace files are text rows (`workFiles`), not Convex file storage; upload/download of `.py/.txt/.csv/.json` with size limits and readable refusals built; not yet tested on a Chromebook |
| V08 | Persistence/submission retry | No false saves; no duplicate attempts; immutable snapshots survive edits/moves. **Oct 15:** autosave shows Saved only after the save mutation resolves, keeps edits through failures/disconnects, and restores add versions without deleting any (unit and `convex-test` evidence). **Oct 15 (Phase 6):** Turn in saves first and reports success only after the mutation returns; a retry with the same idempotency key returns the existing attempt; submitted versions are unchanged after later edits and restores (`convex-test`); a live turn-in and resubmission made exactly one row each |
| V09 | Capacity/provider plan | 50-student active-use checks plus admins; estimated retained files/versions/API use |
| V10 | UI usability/accessibility | Keyboard/focus/contrast, panel resizing, Chromebook viewport, output flood |
| V11 | Tooling readiness | Correct ESLint integration, generated route types, passing lint/typecheck/build |
| V12 | Release readiness | Correct backend/env, auth origins, hosting headers/assets, domain and smoke test |

SDK installation and documentation examples are not evidence of working application features. Pyodide is integrated but remains subject to Chromebook and school-network tests (V02).

## Checks performed — October 28, 2026 (club corrections D13–D17, macOS)

| Check | Result |
| --- | --- |
| Convex codegen + function typecheck / lint / typecheck / production build | Passed. The first build stopped after compiling with a Next.js notice that 16.4.0 is affected by a known security vulnerability (recommending `next upgrade`); a rerun passed. The upgrade was not run |
| Unit/integration tests | `npm test`: 98 passed. Changed or new: turn-in accepted 120 days after the lesson and on an unscheduled day, with no `closesAt` on the card (replaces the cutoff tests); students see the admin's first name on the learning home and the card; admin names skip a leading title, and `createAdmin` / `setDisplayName` refuse one; the seed has 6 basic days, no seats and no turn-in closes; `seed:applyCorrections` turns an older 8-day seed into 6 days, clears seats and turn-in fields, keeps every workspace, and reports “Already up to date.” on a second run; lesson-time conversion incl. DST (replaces the turn-in close tests) |
| Development deployment | Not updated: `npx convex dev` wasn't running, so `tidy-firefly-410` still served the October 16 functions (checked read-only with `npx convex function-spec`) and data (8 basic days, admin display name with a title). Browser checks below exercise the new UI against that older backend; the new backend behavior is covered by the tests above |
| Browser check, student (dev server, 1366×768) | Signed in as `jsmith`: the learning home's day cards read “◐ 1 of 3 turned in” with no closing text and no “closes tonight” card; Day 5 Loops shows its lesson date and no turn-in close; Countdown's card shows “Turned in”, the attempt and review, and an enabled “Turn in again” with no close date; My work shows “Reviewed by Max” / “Note from Max” and no closed note. Login at 375 px: no sideways scroll, admin fields and button full width at 44 px |
| Browser check, admin (developer signed in) | At 1366×768 all seven screens had no horizontal overflow. Found and fixed: the header was 87 px too wide at 1366 because the theme switch's own `inline-flex` beat the `hidden` class meant to hide it below 1536 px (it now sits in a wrapper). Curriculum's timeline shows lessons without turn-in bars; Settings shows the school year and time zone only; Review shows no cutoff line; Assistance shows the class by last name (5 columns) with no seating chart. At 375×812 every screen fit the width with no visible control under 40 px after fixes: Menu (opens with the group switch, sections with centered badges, theme, admin and Sign out; closes on navigation); Students roster cards and the student drawer as a full-screen sheet (focus on “← Students”, page scroll locked, Escape closes and returns focus); Assignments stacked; Curriculum Day picker, assignments first and the timeline scrolled to Day 5; Review queue alone, a student's attempt as a sheet, Next → inside the sheet, “← Queue” back; Assistance help queue and class cards, the selected student as a sheet; Settings and History stacked. Fixed during the check: the Assistance sheet was 23 px too wide (its code bar didn't wrap), several small buttons/links, and the Day picker text. At 1024×768 Students and Review fit with the compact bar and the Review detail in place. Viewport reset to desktop afterwards |
| Not checked | Real phones (iOS Safari, Android Chrome) rather than the pane's emulation; the new backend on `tidy-firefly-410` until it is synced and `seed:applyCorrections` is run |

Scenario 10 (resubmission at any time) and 11 (lesson dates; turn-in stays open) now have `convex-test` evidence under D13; the live check of the new turn-in rule waits for the dev deployment to be synced.

## Checks performed — October 15, 2026 (Phase 6 turn-in and review, macOS)

| Check | Result |
| --- | --- |
| Convex codegen + function typecheck / lint / typecheck / production build | Passed |
| Unit/integration tests | `npm test`: 94 passed. New: 9 `convex-test` tests (a retry with the same key returns the same attempt and a new click adds one; turn-in refused after the close while editing, the card and an earlier click's retry still work, and an unscheduled day has no close; the submitted version is unchanged after a later edit and a restore and review shows it as “not checked”; a guided turn-in carries the check of exactly the submitted version with its output; another student's workspace and someone else's idempotency key are refused; turning in again supersedes the waiting attempt so the badge and queue count it once and the old attempt can't be marked reviewed; queue states and waiting counts match the seeded design data; feedback reaches the student card and learning home while the private note never appears there or in History; review queries and Mark reviewed refuse students and anonymous callers) and 5 Expected vs Actual word-comparison tests |
| Browser check, student (dev server, dev deployment) | The user's running `npx convex dev` had already synced the new functions and schema to `tidy-firefly-410` (checked read-only with `npx convex function-spec`). In the browser pane, already signed in as `jsmith`, at 1366×768: Countdown's card showed “Not turned in · Closes Thu Oct 29, 11:59 pm” and “Sends your last saved version (v14)”. Turn in made attempt 1 on v14 (“✓ Turned in v14 as attempt 1”, “waiting for review”); Turn in again made attempt 2 in 155 ms. `npx convex data submissions` (read-only) showed attempt 1 `superseded`, attempt 2 `unreviewed`, both with the v14 check attached. The learning home then showed Day 5 “1 of 3 turned in”. Name tag (Day 2) showed “Closed Thu Oct 8, 11:59 pm”, attempt 1 · v7, “Reviewed by [admin] · Sep 28”, the seeded feedback, a disabled button and the closed explanation, with the editor still usable. Fixed during the check: the card title wrapped at 372 px, so the attempt number moved to the detail line |
| Browser check, admin (October 16) | Port 3000 was held by a 22-hour-old `next dev` from another terminal for this folder, so the preview couldn't start; it was stopped and the dev server restarted from `.claude/launch.json`. The developer signed in as admin in the pane. `/admin/review` (basic) opened on Day 5 · Countdown with “6 waiting for review”: Jordan (Unreviewed, attempt 2, no completion), Priya (New attempt, attempt 2, partial), Noah, Ava, Maya, Isla (Unreviewed), Owen (Reviewed), then 15 students Not turned in (Ethan “Working copy saved Oct 15”, others “Not started”); the Day picker also showed earlier days' seeded unreviewed work (1, 2, 1, 2 waiting). Jordan's tabs read “Attempt 1 · replaced / Attempt 2 · new” with “Attempt 1 · replaced by a later attempt before review”; the v14 snapshot, Expected `10 9 8 … 1 Liftoff!` against Actual `10 8 6 4 2 Liftoff!` with differing words marked, and the check parts with reasons. Priya's attempt showed “This check was recorded before output was kept” (seeded check). Mark reviewed with feedback and a private note turned Jordan's row Reviewed, the count to 5 and the sidebar badge to 11; the panel showed “✓ Reviewed by [admin] · Oct 16” with both texts kept and Save changes disabled until edited. Next → went Jordan → Priya → Noah. History recorded “Reviewed Jordan Smith’s Countdown, attempt 2” with `feedback: true, privateNote: true` and no text. Running the student queries as Jordan (`npx convex run … --identity`, read-only) returned the feedback on the card and the learning home, never the private note, and `review:queue` refused him. Fixed during the check: the task's “…” was marked as missing in Expected (elisions are now never marked), and marking a student reviewed jumped the view to the new first row (the selection now stays until Next) |
| Development data | Jordan's Countdown now has attempts 1 (superseded) and 2 (reviewed, with test feedback “Close! Check how much count goes down each time through the loop.” and a private note “Phase 6 browser check: private note test.”) on v14, and a History entry for that review; its code wasn't changed. The pane is now signed in as admin |
| Not checked | Turn-in from a Chromebook; a real network drop between the click and the answer (covered by the key logic and tests only) |

Scenario 9 (turn-in captures saved files; retries/concurrent edits preserve distinct snapshots) and scenario 10 (resubmission; latest attempt stays unreviewed until reviewed) now have `convex-test` and live student and admin evidence; scenario 11 has server-side cutoff tests and a live closed card. None is marked passed end to end.

## Checks performed — October 15, 2026 (Phase 5 guided evaluation, macOS)

| Check | Result |
| --- | --- |
| Convex codegen + function typecheck / lint / typecheck / production build | Passed |
| Unit/integration tests | `npm test`: 80 passed. New: 9 evaluation-rule tests (spacing ignored, the design's count-by-2 bug partial with “expected “9” after “10”, got “8””, missing “!” fails only the ending, equals/extra output, empty output, contains with surrounding output, classification and explanations); 5 loop-observation tests with real Pyodide; 3 runtime check tests (stdout capture and loop limit, timeout, Stop not counted as timeout); 3 Convex check tests (version pinning and reuse, server evaluation and stale-after-edit, loop exercises get observation and check input, refusals for open-ended work, another student, a foreign version and a changed task) |
| Browser check (dev deployment) | As `jsmith`: Countdown v14 checked in 0.8 s; Convex reported no completion with “expected “9” after “10”, got “8”” on the first two parts (this deployment still has the older seeded part `begins "10 9"`; a fresh seed uses `begins "10"`, which makes the bug partial as in the design). Forever greeter (opened for the check): the greeter was watched for 1,000 rounds and stopped on purpose, ✓ Completion on a new “Checked” v2, with the planned-stop note. A check of `sum(range(10**12))` couldn’t be interrupted, so Python restarted after the 10 s limit plus 2 s grace and the result said the program didn’t finish. Editing after a check showed the stale notice. Fixed during the check: the `input()` prompt was lost when a check had to restart Python, so output is now flushed on every `input()` in check mode |
| Development data | Jordan now has a Forever greeter workspace (greeter code, versions v1–v4, latest check complete) and new check results on Countdown v14. Countdown's code wasn't changed |
| Not checked | Chromebook speed for 1,000-round checks; checks with packages on school networks |

Scenario 6 (assignment-specific thresholds and whitespace normalization yield explainable outcomes) now has unit, `convex-test` and live evidence; not marked passed end to end until turn-in and review exist.

## Checks performed — October 15, 2026 (Phase 4 Python runtime, macOS)

| Check | Result |
| --- | --- |
| Convex codegen + function typecheck | Passed |
| Lint / typecheck / production build | Passed; the build bundles the worker (`public/python/worker.js`, minified) and copies Pyodide |
| Unit/integration tests | `npm test`: 60 passed. New: 13 runner tests with real Pyodide 314.0.7 in Node (stdout, `__main__`, imports and reload after edits, fresh namespace and deleted files, tracebacks without runner frames or the work folder path, syntax errors, `input()` with prompt, `sys.exit` codes, interrupting an infinite printing loop after 50 lines with output kept, `math/random/statistics/decimal/fractions/collections/itertools/json/csv` with a CSV file), 5 output batching/trimming tests, 6 runtime-client tests with a fake worker (current-run output only, interrupt then keep Python, restart after the grace period, restart-only when not isolated, typed input through shared memory, load failure and retry), 2 package-list tests (save/read, bad names, duplicates, another student refused) |
| Browser check (dev server, dev deployment) | Signed in as the seeded student `jsmith` at 1366×768. The page reported `crossOriginIsolated: true`. First attempt failed with “Classic web workers are not supported” because Next started the worker as a classic script; fixed by bundling the worker separately. Then: “● Python ready” (Python 3.14.2); Countdown printed `10 8 6 4 2 Liftoff!` with “Finished in 0.01s · run by you · main.py”; an infinite printing loop reached the 2 MB per-run limit in about 3 s with the trimmed/limit notes, and Stop ended it in under 1 s without a restart; `input("Name? ")` showed the input line, focused it, echoed “Name? Ada”, then printed a `ZeroDivisionError` traceback pointing at `main.py` line 3 with the Error pill; installing `emoji` took about 2 s and saved it to the workspace; `psycopg2-binary` was refused with the compiled-code message; after a reload the saved package reinstalled before the run and printed “Python is 👍”. Fixed during the check: duplicate element ids for the input line and package field |
| Development data | The check temporarily changed `jsmith`’s Loop art `main.py` and package list, then restored the original code and removed the package (extra versions remain in its history). Countdown was only run, not edited |
| Not checked | Safari/non-isolated fallback in a real browser (unit-tested only); Chromebook performance and school-network access to jsDelivr/PyPI (V02) |

## Checks performed — October 15, 2026 (Phase 3 editor and persistence, macOS)

| Check | Result |
| --- | --- |
| Convex codegen + function typecheck | Passed (`npx convex codegen --typecheck enable`); nothing pushed to a deployment |
| Lint | Passed with no warnings/errors |
| Typecheck | Passed (`npm run typecheck`) |
| Production build | Passed; `/learn/assignments/[assignmentId]` partially prerendered as before |
| Unit/integration tests | `npm test`: 34 passed. New: 8 `convex-test` workspace tests (starter files become v1 and reopening returns the same workspace; drafts and other curricula refused while a student's own past work opens; another student's workspace refused for save, versions, version and restore, plus anonymous and admin callers; autosave adds at most one version per 2 minutes; a save over another tab's change keeps it in history; restore adds a checkpoint and a `restore` version and leaves every earlier version unchanged; file name/size/duplicate rules) and 9 autosave-engine tests (not Saved until the save resolves, max-wait saving while typing, retry with backoff, no retry for refused saves, offline state, own-save echo, merge/conflict rules, server removals, flush) |
| Browser check (harness) | Editor rendered with a temporary harness page on a production build at 1366×768 (page removed afterwards): Geist Mono 500 15/26 px, 52 px gutter, design syntax colors on `--code-bg`; Enter auto-indents 4 spaces; switching files keeps each file's text; Saving… → ✓ Saved, Save failed · Retry → automatic retry → Saved, and Offline · changes kept all observed |
| Browser check (live, dev deployment) | After the developer pushed, set auth keys, created an admin and seeded `tidy-firefly-410`, the production build was served on localhost:3101 and the developer signed in as `jsmith`. Countdown opened Jordan's seeded v14 with “✓ Saved”, task, expected output and turn-in close; Versions listed v14 and inspecting it showed the read-only view. Loop art created a workspace (v1 “start”, empty `main.py`); typed code reached `workFiles` exactly (checked with `npx convex data`); `+` refused “my shapes” with a readable message and created `shapes.py`; uploading `shapes.csv` added and saved it, while `scores 2026.csv`, a 150 KB `big.txt` and `picture.png` were refused with messages; Download produced `shapes.csv` with the same text; a reload restored all three files; an autosave checkpoint v2 appeared about 3 minutes after v1; restoring v1 added v3 (pre-restore work) and v4 “Restored v1” and removed the extra files; restoring v3 brought all files back as v5; editing afterwards saved without a conflict notice or extra version; the header Day link waited for a running save before leaving. The unload handler cancels unload only while unsaved, but the pane's scripted navigation skips the browser's “Leave site?” prompt, so the prompt itself was not seen and an edit made just before that scripted reload was lost. Fixed during the check: type tag alignment in the header, element ids duplicated by Next keeping a left workspace mounted, Python highlighting on non-`.py` files, upload message for wrong file types |
| Dark editor fix | The build compiles `light-dark()` into variables resolved where tokens are declared, so `.scheme-dark` regions (editor, code views) had been rendering light colors. Tokens are now declared on `:root, .scheme-dark` in `app/globals.css`; verified dark in the browser |
| Development deployment | Pushed by the developer (`npx convex dev --once`), then auth keys, an admin and the seed were set up. The check left a Loop art workspace for `jsmith` (5 versions, 3 files). Someone else signed in as `jsmith` (the developer or another session) also created a workspace with `print("Hello")` and an empty `helpers.py` on a third assignment during the check; it is not from this check |
| Production data | Not inspected or modified |
| Device/load tests | Not performed |

Scenario 7 (loop/output floods stop; restart preserves files) now has unit and live-browser evidence for Stop and output limits; loop counting is Phase 5.

Scenario 5 (save/resume/disconnect) now has unit and `convex-test` evidence for autosave, offline buffering and restore; it is not marked passed end to end.

## Checks performed — October 15, 2026 (Phase 1 structure, macOS)

| Check | Result |
| --- | --- |
| Convex codegen + function typecheck | Passed (`npx convex codegen --typecheck enable`) |
| Lint | Passed with no warnings/errors |
| Typecheck | Passed (`npm run typecheck`) |
| Production build | Passed; 17 routes, dynamic `[id]` routes partially prerendered |
| Unit/integration tests | `npm test`: 17 passed — login-code suffixes, student code and admin password sign-in round trips, wrong password, refused admin sign-up, anonymous/student/admin access refusals, drafts hidden from students, reassignment keeps identity and historical group, duplicate-code refusal, change history entry, Pacific turn-in close incl. DST, partial rule |
| Browser check | Login screen rendered at 1366×768 in light and dark and matched the design. Live student/admin screens not yet checked in a browser: the backend had not been pushed to the dev deployment at the time |
| Development deployment | `tidy-firefly-410` is the personal dev deployment of team member Prithvi Konduru in team `code-cs`. Push, auth env vars, admin creation and seeding are run by a developer (see [deployment](deployment.md)) |
| Production data | Not inspected or modified |
| Device/load tests | Not performed |

Scenarios 1, 2, 3, 4 and 11 below have unit-test evidence for the parts built in Phase 1 only; none is marked passed end to end.

## Checks performed — October 14, 2026 (documentation task, Windows)

| Check | Result |
| --- | --- |
| Frontend/source inspection | Starter page/metadata; no student/admin implementation |
| Convex MCP status | Success; dev `tidy-firefly-410`, prod `moonlit-alpaca-771` listed read-only |
| Development tables/functions | Empty; no application backend deployed |
| Package inspection | Next.js and ESLint config 16.4.0, React 19.3.0, Convex 1.46.0, ESLint 10.12.0, TypeScript 6.0.3, Node types 24.19.2 |
| Lint | Passed with no warnings/errors; generated Convex SDK files excluded |
| Typecheck | Passed after route type generation; `npm run typecheck` generates types before checking |
| Route type generation | Passed outside the Windows sandbox; restricted execution previously failed with access denied (os error 5) |
| Production build | Passed; starter `/` and `/_not-found` routes generated |
| Dependency versions | Registry checked; TypeScript stays on 6 because the lint parser rejects 7; Node types match the installed Node 24 runtime |
| Dependency compatibility | Next.js supports ESLint 10; bundled import, JSX accessibility, and React plugins still declare older peer ranges and cause npm peer warnings |
| Clean install check | `npm ci` reached installation but Windows refused to replace a locked `esbuild.exe` (EPERM); dependencies restored from npm cache and checks rerun, but clean installation remains unverified in this running workspace |
| Dependency security audit | Five high-severity findings from the `braces` → `micromatch` → `fast-glob` → Next.js lint dependency chain; latest braces is 3.0.3 with no patched release available. npm's suggested ESLint-config downgrade recreates the loading failure |
| Production data | Not inspected or modified |
| Device/product/load tests | Not performed; features remain unimplemented |

Documentation link/coverage/whitespace checks do not change product verification status.

## Required implementation scenarios

1. Duplicate names remain distinct; returning rosters preserve identity across years.
2. Basic/advanced changes preserve and correctly label historical work.
3. Student ownership and admin-only actions are enforced in the backend.
4. Correct guided/project work opens; drafts stay private.
5. Save/resume/disconnect behavior preserves edits without false success.
6. Assignment-specific thresholds and whitespace normalization yield explainable outcomes.
7. Loop/output floods stop; runtime restart preserves files/history.
8. Direct assistance notifies; edits/cursors synchronize; help and guidance retain context.
9. Turn-in captures saved files; retries/concurrent edits preserve distinct snapshots.
10. Return/resubmit works for all results at any time (D13); latest attempt remains unreviewed until reviewed.
11. Lesson dates follow the school time zone and D06; turn-in stays open with editing/history intact (D13).
12. Published changes preserve earlier snapshots/results according to D08.
13. Admin history records actors/changes without secrets.
14. Slides/files/packages work under supported device/network conditions.
15. Active concurrent use meets the stated capacity.

Mark scenarios passed only after the feature exists and evidence is recorded.
