# UI Structure and Component Requirements

[Documentation index](README.md). This guide covers shared layout and components; feature-specific behavior also appears in student/admin guides.

## Roles, pages, and navigation

Students access their own work and the learning material available through their assigned curriculum. Admins (the high school students who run the club) perform the teaching and management functions: students, curricula, lessons, assignments, assistance, and review. Assistance means an authenticated admin helping a student. Student-facing copy names an admin by first name (“Max joined”, “Note from Max”), never with a title or a staff role word; the admin area calls the role “admin” (D15). Access rules must apply to data and actions as well as visible navigation.

| Page or workspace | Purpose | Main components |
| --- | --- | --- |
| Home / Login | Persistent student code entry or separate admin username/password sign-in | Student code form; admin credentials form; errors |
| Student Learning Home | Navigate curriculum days and resume assignments | Group/curriculum context; day list; assignment progress; own historical work |
| Lesson Day | Access topic slides and associated assignments | Topic; scheduled date; slides access; guided/project labels; assignment list |
| Assignment Workspace | Read task, code in Python, check output, receive help, turn in | Task panel; editor; file tools; Run/Stop; output/check results; help; guidance; submission state |
| Student Work History | Reopen personal work across years and curriculum changes | Historical lesson/assignment context; saved work; submissions; feedback |
| Admin Dashboard / Students | Import roster, manage students, change curriculum, print tickets, take attendance | Basic/advanced selector; roster; import; curriculum controls; ticket printing; attendance |
| Admin Dashboard / Curriculum and Lessons | Manage topics, slides, assignments, and annual dates | Curriculum selection; day/topic list; slides; yearly schedule |
| Admin Dashboard / Assignments | Author work and manage drafts | Type-specific editor; expected-output configuration; draft/publish actions |
| Admin Dashboard / Assistance | See active students, help alerts, and assist directly | Student presence; help requests; class list (no seating chart); shared workspace; guidance |
| Admin Dashboard / Review | Inspect final work and give feedback | Submitted snapshot; guided results where applicable; feedback |

These describe navigable areas; closely related areas may share a page. Group context replaces every previous class selector. Historical year controls organize dates and saved work only.

## UI design requirements

### Flow and information hierarchy

- Student navigation follows curriculum -> day -> assignment -> Python work, with personal history accessible throughout.
- Admin dashboard navigation follows students, curriculum/lesson scheduling, assignment authoring, assistance, review, and settings.
- Keep student, group/curriculum, day, and assignment context visible where actions depend on them.
- Place actions near the content they affect: Run/Stop by the editor, Turn in with assignment status, curriculum changes with student identity.
- Present Run and Turn in as different actions with different consequences.
- Preserve context when moving between lesson slides and coding.
- Introduce controls only for documented features.

### Workspace layout and components

- Use a LeetCode-style task/editor arrangement for guided work, with readable output/check results and accessible guidance.
- Give the editor the most space while retaining access to instructions, files, and output.
- Reuse consistent day entries, assignment entries, roster rows, buttons, fields, panels, and status indicators.
- Distinguish guided results, work progress, save status, submission state, execution state, and assistance presence.
- Progress labels must not imply numerical grades.
- Live admin cursors include first names and remain distinguishable without relying on color alone.
- Guidance and help alerts must not steal editor focus or obscure essential controls.

### Interaction states and accessibility

- Define default, hover, keyboard-focus, disabled, and in-progress component states where applicable.
- Provide loading, empty, error, retry, and populated states for data-driven views.
- Forms have labels, actionable validation, and preserved input on failures.
- Turn-in has no due date, closing time or late label (D13); a disabled Turn in only waits for loading or a save in progress.
- Show success only after the corresponding save, import, check, or submission succeeds.
- Support keyboard navigation, visible focus, readable contrast, and text alongside status colors.
- Do not unexpectedly move focus when output, check results, or guidance updates.

### Responsive and visual design

- Use consistent typography hierarchy, spacing, and component treatments.
- Prioritize reading tasks, writing Python, understanding output, and receiving assistance over decoration.
- Smaller layouts may rearrange panels but must preserve task context and access to essential actions. The admin area is built to work on phones; see [responsive breakpoints](#responsive-breakpoints).
- Keep save and assistance status visible as panels change.
- Use plain, consistent labels such as Run, Stop, Help, Turn in, Save draft, basic, and advanced.
- Branding, colors and layouts follow the approved **CodeCS Basic v2** design (decision D10); see [Visual system](#visual-system).

## Component contracts

| Component | Responsibilities | Essential states |
| --- | --- | --- |
| Login forms | Student code versus admin credentials; sign-in | Idle, submitting, invalid, authenticated |
| Day/assignment entries | Topic/date if scheduled, type, open/resume, progress/submission | Loading, empty, available, failed |
| Workspace header | Day/assignment context, return, save/assistance | Saving, saved, disconnected, admin joined (by first name) |
| Task/editor/files | Instructions/examples, Python text, files, named cursors | Editing, synchronizing, reconnecting, restoring |
| Run/Stop toolbar | Runtime execution actions | Loading, ready, running, stopping, restarting, unavailable |
| Output/check panel | Raw output, errors, requirements, outcome | Pending, intentionally stopped, error, checked, stale result |
| Turn-in controls | Snapshot action, latest attempt (never closes) | Saving, submitted, returned, resubmitting |
| Help/guidance | Alert state and contextual assistance | Pending, assisting, disconnected, ended |
| Admin forms | Target student/curriculum/year, validated fields, save | Dirty, saving, saved, failed |
| Review history | Attempts/snapshots/checks/feedback/return | Unreviewed, returned, new unreviewed attempt |
| Change history | Actor/time/record/prior-new values | Loading, empty, populated, failed |

These describe responsibilities, not extra features or final mockups. Preserve separate save, runtime, result, submission, and presence indicators. Accessibility/responsive behavior requires testing on implemented UI, including actual Chromebook viewports.

## Responsive breakpoints

The student side is designed for the **1366×768 Chromebook**; the login page also works on a phone. The admin area works from a **375 px** phone up to the Chromebook layout, which stays exactly as designed (D17). Breakpoints are Tailwind's defaults:

| Width | Name | Admin layout |
| --- | --- | --- |
| < 640 px | phone (`max-sm`) | Login's admin fields go full width; Settings' label/value pairs stack |
| < 768 px | phone (`max-md`) | 16 px side padding and smaller page titles. Tables stack into cards (Students roster: name and login code, then attendance; History: when and who, then the change, before and after). Pickers and selects go full width at 44 px tall; buttons and segmented controls grow to about 44 px. Side panels become full-screen sheets with a “← Back” bar (Escape also closes, and focus returns to what opened them): the student drawer, the selected student on Assistance, and a student's attempt on Review, which shows the queue alone until someone is picked. Curriculum adds a Day picker and lists a day's assignments first; the year timeline scrolls inside its own box, starting at the selected lesson. Assignments stacks its day cards; the assignment editor stacks the day's assignments (with ↑/↓), the details and the evaluation, with full-width Save draft and Publish |
| 768–1279 px | tablet / small laptop (`md`, `lg`) | Desktop padding and type; panels stack in one column (Curriculum's day panels go side by side from `lg`) |
| < 1280 px | (`max-xl`) | The admin navigation collapses into a compact top bar: CodeCS ADMIN, the group, and a **Menu** button (it shows the help-queue count). The menu holds the basic/advanced switch, every section with its badge, the theme, the signed-in admin and Sign out; it closes on Escape, a tap outside or navigation |
| ≥ 1280 px | desktop (`xl`) | The full header and the multi-column screens from the design, unchanged at 1366×768 |

Nothing on an admin screen may scroll the page sideways at 375 px; wide content (the timeline, code) scrolls inside its own container. `components/ui/PhoneSheet.tsx` implements the sheets with `display: contents` from `md` up, so desktop grids keep their layout, and `lib/useMediaQuery.ts` exposes the phone query.

## Visual system

The approved reference is the Claude Design project **CodeCS Basic v2**, saved in the repository at [`design/CodeCS Basic v2.dc.html`](../design/CodeCS%20Basic%20v2.dc.html). It shows all 10 screens at a **1366×768** Chromebook viewport in light and dark.

- **Tokens** live in `app/globals.css` as `light-dark()` pairs and are exposed to Tailwind (`bg-sf`, `text-ink3`, `bg-mint-s`, …). Change colors there, not in components.
- **Color roles:** mint is the brand and primary action; amber marks partial work, warnings and help; coral marks errors and unmet checks; violet always means an admin (joined, cursors, feedback). Status always carries text or a symbol as well as color.
- **Type:** Open Sauce Sans (self-hosted via `@fontsource`) for UI; Geist Mono for code, login codes and file names.
- **Themes:** light, dark, or follow the device (Auto), saved per device. The code editor stays dark by default in both themes.
- **Components** are in `components/ui/` (shared), `components/student/`, `components/workspace/` and `components/admin/`.

## Route map

| Route | Screen (design id) | Data |
| --- | --- | --- |
| `/` | Home / Login (4a) | Live sign-in |
| `/learn` | Student Learning Home (4b) | Live |
| `/learn/days/[dayId]` | Lesson Day (4c) | Live; days that aren't open yet (D04) say when they open |
| `/learn/assignments/[assignmentId]` | Assignment Workspace (4d) | Live editor and autosave (Phase 3), Python Run/Stop/input/packages (Phase 4), guided checks (Phase 5), Turn in with attempts and feedback (Phase 6); Help later |
| `/learn/work` | Student Work History (4e) | Preview fixtures (Phase 2) |
| `/admin/students` | Admin / Students (4f) | Live roster, attendance, student edits |
| `/admin/curriculum` | Admin / Curriculum and Lessons (4g) | Live timeline, day content, cover upload, lesson dates, add/reorder/remove days (Phase 7) |
| `/admin/assignments` | Assignments list (no design; styled like 4g) | Live: assignments by day, new drafts (Phase 7) |
| `/admin/assignments/[assignmentId]` | Admin / Assignments (4h) | Live editor: drafts, publishing, task versions, reorder, unpublish/remove (Phase 7) |
| `/admin/assistance` | Admin / Assistance (4i) | Preview fixtures (Phase 9); a class list replaces the design's seating chart (D14) |
| `/admin/review` | Admin / Review (4j) | Live queue, submitted snapshots, checks, feedback, private notes and Mark reviewed (Phase 6); “Open live working copy” goes to Assistance until Phase 9 |
| `/admin/settings` | Settings (no design) | Live, read-only: school year and time zone |
| `/admin/history` | Change history (no design) | Live |

Preview screens show a “Preview” banner and disable actions that would need saving. The [roadmap](roadmap.md) lists what each phase connects.
