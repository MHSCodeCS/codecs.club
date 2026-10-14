# UI Structure and Component Requirements

[Documentation index](README.md). This guide covers shared layout and components; feature-specific behavior also appears in student/admin guides.

## Roles, pages, and navigation

Students access their own work and the learning material available through their assigned curriculum. Admins perform the teaching and management functions: students, curricula, lessons, assignments, assistance, and review. Teacher assistance refers to an authenticated admin acting as the teacher. Access rules must apply to data and actions as well as visible navigation.

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
| Admin Dashboard / Assistance | See active students, help alerts, and assist directly | Student presence; help requests; shared workspace; guidance |
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
- Live teacher cursors include names and remain distinguishable without relying on color alone.
- Guidance and help alerts must not steal editor focus or obscure essential controls.

### Interaction states and accessibility

- Define default, hover, keyboard-focus, disabled, and in-progress component states where applicable.
- Provide loading, empty, error, retry, and populated states for data-driven views.
- Forms have labels, actionable validation, and preserved input on failures.
- Disabled turn-in explains the closing date/reason.
- Show success only after the corresponding save, import, check, or submission succeeds.
- Support keyboard navigation, visible focus, readable contrast, and text alongside status colors.
- Do not unexpectedly move focus when output, check results, or guidance updates.

### Responsive and visual design

- Use consistent typography hierarchy, spacing, and component treatments.
- Prioritize reading tasks, writing Python, understanding output, and receiving assistance over decoration.
- Smaller layouts may rearrange panels but must preserve task context and access to essential actions.
- Keep save and assistance status visible as panels change.
- Use plain, consistent labels such as Run, Stop, Help, Turn in, Save draft, basic, and advanced.
- Branding, final colors, and detailed visual layouts will be settled in the design discussion.

## Component contracts

| Component | Responsibilities | Essential states |
| --- | --- | --- |
| Login forms | Student code versus admin credentials; sign-in | Idle, submitting, invalid, authenticated |
| Day/assignment entries | Topic/date if scheduled, type, open/resume, progress/submission | Loading, empty, available, failed |
| Workspace header | Day/assignment context, return, save/assistance | Saving, saved, disconnected, teacher joined |
| Task/editor/files | Instructions/examples, Python text, files, named cursors | Editing, synchronizing, reconnecting, restoring |
| Run/Stop toolbar | Runtime execution actions | Loading, ready, running, stopping, restarting, unavailable |
| Output/check panel | Raw output, errors, requirements, outcome | Pending, intentionally stopped, error, checked, stale result |
| Turn-in controls | Cutoff and snapshot action, latest attempt | Saving, submitted, returned, resubmitting, closed |
| Help/guidance | Alert state and contextual assistance | Pending, assisting, disconnected, ended |
| Admin forms | Target student/curriculum/year, validated fields, save | Dirty, saving, saved, failed |
| Review history | Attempts/snapshots/checks/feedback/return | Unreviewed, returned, new unreviewed attempt |
| Change history | Actor/time/record/prior-new values | Loading, empty, populated, failed |

These describe responsibilities, not extra features or final mockups. Preserve separate save, runtime, result, submission, and presence indicators. Detailed visual choices remain D10 in the [decision register](decisions-and-verification.md). Accessibility/responsive behavior requires testing on implemented UI, including actual Chromebook viewports.
