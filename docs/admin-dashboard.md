# Admin Dashboard

[Documentation index](README.md). Application admin accounts are distinct from developer access to Convex. Pending choices are tracked in the [decision register](decisions-and-verification.md).

## Admin authentication and dashboard

### Specific admin accounts

The non-student side uses specific admin usernames and passwords backed by Convex. This replaces the earlier Google-account login requirement. Admins do not use student name codes to access management features.

- Persist each admin identity and authentication records in Convex; store password hashes rather than readable passwords.
- Admin sign-in opens the admin dashboard, with visible signed-in identity and sign-out.
- Check admin authorization in backend operations as well as page navigation. A student session cannot perform management operations.
- The account provisioning, recovery process, and authentication library will be settled before implementation.
- Website admin accounts are distinct from developer accounts used to operate the Convex service.

### Dashboard scope

The dashboard is the entry point for every approved non-student feature. It exposes defined forms and actions for editing application data; admins do not need the developer's Convex dashboard for normal teaching work.

| Dashboard area | Required capabilities |
| --- | --- |
| Students | Spreadsheet roster intake; view/edit student records; change login code; change basic/advanced group and curriculum; print login tickets; record attendance |
| Lessons and Slides | Upload lessons and slides; organize curriculum days/topics; replace/edit lesson material; make slides available to students |
| Schedule | Edit yearly lesson dates and times; show their relationship to turn-in windows |
| Assignments | Create/edit guided and open-ended assignments; manage drafts and publication; change instructions, files, expected output, and evaluation configuration |
| Review and Notes | Open submitted snapshots and saved student work; review expected versus actual output and completion results; add notes and student feedback; inspect every submission, return, and resubmission |
| Assistance and Help | See help alerts and active students; join work directly with notification; view/edit/run code; use labeled cursors; send guidance |
| Settings | Edit approved behavior settings, including turn-in duration and closing times |
| Change History | Inspect recorded admin changes to student records, logins, curricula, lessons, assignments, schedules, and settings |

Configurable functionality means exposing controls for approved product behavior. New features still require discussion before they appear in the specification or dashboard.

### Data-editing and UI requirements

- Student curriculum changes retain identity, old work, submitted versions, and history.
- Changing a student login is an explicit admin action. Validate uniqueness across all students and retain the student's internal identity and work; display the updated code for ticket reprinting.
- Schedule and cutoff controls show the target year, lesson, effective date/time, and time zone. Unscheduled lessons must not acquire invented dates.
- Content, expected-output, and configuration edits cannot silently overwrite student files, prior submissions, or historical check results.
- Notes associated with student review must be clearly distinguished from execution output and automated check results. Whether every note is student-visible still needs a decision.
- Use contextual forms with validation and save feedback for editable data rather than exposing arbitrary database fields.
- Separate live assistance from review of a submitted snapshot, while preserving a clear path between them.
- Use a persistent dashboard navigation with the selected group/curriculum/year visible where relevant.
- Expose every approved teaching feature within the dashboard; keep these controls out of the student interface.
- Record admin changes with the acting admin, time, affected record, and relevant previous/new values. Never record readable passwords or credentials in change history.

## Admin dashboard workflows

### Student intake and management

1. Sign in with the assigned admin username and password.
2. Import student information from the supplied roster spreadsheet.
3. Assign each student to basic or advanced and the appropriate curriculum.
4. Save identities, roster information, and assignments in Convex.
5. Print persistent name-code login tickets.
6. Change group/curriculum as needed without resetting history.

UI requirements:

- Preview spreadsheet field mapping and import results before committing changes.
- Show missing required information and identity/code conflicts per row.
- Avoid creating duplicate student identities when a returning student appears in a later roster.
- Show existing identity, current group, and curriculum together around reassignment controls.
- A group change takes effect in the student's current curriculum view without deleting old work.
- Use only basic and advanced as group choices; do not generate annual classes.
- Printed tickets include student identity, website address, stable login code, and sign-in instructions.
- Attendance uses group and lesson/date context and remains separate from online presence.

The spreadsheet columns, supported file formats, and persistent-identity matching rule must be agreed before import implementation.

### Curriculum days and annual scheduling

1. Select the basic or advanced curriculum.
2. Create/manage topic days, such as variables and loops.
3. Upload slides and associate assignments with each day.
4. Enter lesson dates and times for the relevant year when known.
5. Adjust dates as the teaching schedule changes.

UI requirements:

- Separate curriculum content from the year-specific schedule.
- Changing a new year's dates must not overwrite previous years' lesson dates or student history.
- Show unscheduled days explicitly.
- Explain the effect of date changes on associated turn-in windows.
- Keep group, curriculum, topic, and schedule year visible where relevant.

### Assignment authoring

1. Select a curriculum day and assignment type.
2. Write the task instructions.
3. For guided work, define meaningful required parts, expected-output checks, and the assignment-specific minimum for partial completion.
4. For open-ended work, provide the project/final instructions.
5. Save a draft, then publish it to the intended curriculum day.

UI requirements:

- Show type-specific controls; do not require output checks for open-ended projects.
- Guided authoring includes named requirements, associated checks, and a partial-completion rule; do not use a universal percentage for all assignments.
- Distinguish Save draft from publishing to students.
- Keep unpublished drafts out of student views.
- Show which curriculum day receives the assignment.
- Content changes must not silently overwrite students' saved files or prior submissions.

### Assistance and review

- View active students and help alerts, then open the relevant work directly.
- Join with a student notification and use shared editing, Run, and guidance controls.
- Review submitted snapshots and guided-check outcomes.
- See the requirement-level results and why the submitted work qualifies as complete, partial, or not complete.
- Provide feedback without requiring numerical grades.
- Return reviewed work to the student for editing and resubmission, preserving earlier snapshots and feedback.
- Show all submission attempts and teacher returns on the admin dashboard, including the saved version, timestamp, check result, and associated feedback for each attempt.

UI requirements:

- Keep student identity, group, lesson day, and assignment visible during assistance/review.
- Distinguish a live working copy from a submitted snapshot.
- Distinguish the latest submission and its review state from earlier attempts. A new submission must not appear reviewed merely because an earlier attempt was reviewed.
- Show help alert status and avoid duplicate alerts for the same unresolved request.
- Distinguish connected, disconnected, and stale student presence.
