# Decisions and Verification Register

[Documentation index](README.md). Updated October 14, 2026. These are unresolved choices and evidence gaps, not proposed additional features. The documentation describes agreed scope; it does not imply implementation readiness.

## Resolved

- Convex retained; cloud development/MCP access verified.
- Permanent basic/advanced groups and student identities; no classes/yearly accounts.
- Name codes with duplicate suffixes; explicit admin login changes allowed.
- Admin username/password login replaces Google sign-in.
- Browser Python first, lightweight beginner/advanced learning libraries, Chromebook constraints.
- Whitespace-insensitive checks, assignment-specific partial rules, up to 1,000 observed loop iterations.
- Direct teacher entry with notification, simultaneous editing/named cursors, Run/guidance/help alerts.
- Return/edit/resubmit for any completion result until cutoff; all attempts remain visible.
- Admin change history included; separate backup system excluded.
- Managed hosting, no domain/frontend hosting; 50 concurrent/1,000 lifetime students.

## Product decisions requiring input

| ID | Decision | Needed before |
| --- | --- | --- |
| D01 | Slide delivery: uploaded export formats versus source-service link/embed | Slides component and school access |
| D02 | Admin provisioning and forgotten-password recovery | Authentication |
| D03 | Spreadsheet columns/formats and stable returning-student match key | Roster import; avoid merging same-name people |
| D04 | Future lessons available immediately versus admin release | Publication/student day list |
| D05 | Exact turn-in default, closing time/time zone, unscheduled-day behavior | Cutoff checks; approximately two weeks is not a finalized default |
| D06 | Whether lesson-date changes automatically move cutoffs | Scheduling controls |
| D07 | Student-visible versus private review notes | Notes/feedback access |
| D08 | Published edits applied to existing work and any re-evaluation | Versioned assignment publication |
| D09 | Resubmitting before an earlier attempt is returned | Submission lifecycle; approved rule covers after-return work |
| D10 | Branding, colors/theme, visual references, minimum editing viewport | Final UI layouts |
| D11 | Attendance values and lesson/session identification | Attendance entry |
| D12 | Frontend provider, domain choice, and account ownership | Release |

Do not silently invent approved defaults. Independent implementation work can proceed while the relevant decision remains pending.

## Engineering choices and evidence needed

| ID | Work item | Required evidence |
| --- | --- | --- |
| V01 | Browser runtime/package selection | Python fundamentals, lightweight modules, files/imports, repeated runs, compatible package installs |
| V02 | School device/network | Cold/repeated startup and runtime/database/package/slide access on actual school Chromebook/network |
| V03 | Stop and loop counting | Busy/infinite loops stop without UI freeze; nested loops and multiple/zero prints do not confuse iterations with lines |
| V04 | Collaboration/presence/restores | Two browsers converge; disconnects, concurrent edits/restores preserve work |
| V05 | Remote Run routing | Correct version/actor; explicit busy/offline/late-result behavior |
| V06 | Auth integration/access | Hashes/sessions; negative student/admin access tests; recovery consistent with D02 |
| V07 | File/slide storage | Durable uploads/resume/download; appropriate ownership/access; actionable failures |
| V08 | Persistence/submission retry | No false saves; no duplicate attempts; immutable snapshots survive edits/moves |
| V09 | Capacity/provider plan | 50-student active-use checks plus admins; estimated retained files/versions/API use |
| V10 | UI usability/accessibility | Keyboard/focus/contrast, panel resizing, Chromebook viewport, output flood |
| V11 | Tooling readiness | Correct ESLint integration, generated route types, passing lint/typecheck/build |
| V12 | Release readiness | Correct backend/env, auth origins, hosting headers/assets, domain and smoke test |

SDK installation and documentation examples are not evidence of working application features. Pyodide and auth-library choice remain technical decisions within scope, subject to compatibility tests.

## Checks performed for this task

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
10. Return/resubmit works for all results before cutoff; latest attempt remains unreviewed until reviewed.
11. Time-zone boundaries/date changes follow D05/D06; closed turn-in retains editing/history.
12. Published changes preserve earlier snapshots/results according to D08.
13. Admin history records actors/changes without secrets.
14. Slides/files/packages work under supported device/network conditions.
15. Active concurrent use meets the stated capacity.

Mark scenarios passed only after the feature exists and evidence is recorded.
