# Admin Dashboard

[Documentation index](README.md). Application admin accounts are distinct from developer access to Convex. Pending choices are tracked in the [decision register](decisions-and-verification.md).

## Admin authentication and dashboard

### Specific admin accounts

The non-student side uses specific admin usernames and passwords backed by Convex. This replaces the earlier Google-account login requirement. Admins do not use student name codes to access management features.

- Persist each admin identity and authentication records in Convex; store password hashes rather than readable passwords.
- Admin sign-in opens the admin dashboard, with visible signed-in identity and sign-out.
- Check admin authorization in backend operations as well as page navigation. A student session cannot perform management operations.
- Authentication uses Convex Auth’s password provider. Settings includes Teacher Accounts with first and last names, automatically generated name-based login codes, student-style avatars, editing (including password resets), and deletion. Teacher login codes stay stable when names are edited. Teachers have full admin access and cannot delete their own account. Deleting a staff account removes its user, credentials and sessions while keeping audit logs and authored work; deleted staff names remain visible in history. The internal `admins:createAdmin` CLI function remains available for initial setup.
- Website admin accounts are distinct from developer accounts used to operate the Convex service.

### Dashboard scope

The dashboard is the entry point for every approved non-student feature. It exposes defined forms and actions for editing application data; admins do not need the developer's Convex dashboard for normal teaching work.

| Dashboard area | Required capabilities |
| --- | --- |
| Students | Spreadsheet roster intake; view/edit student records; change login code; change basic/advanced group and curriculum; print login tickets; record attendance |
| Lessons and Slides | Upload lessons and slides; organize curriculum days/topics; replace/edit lesson material; make slides available to students |
| Schedule | Edit yearly lesson dates and times (turn-in never closes, so a date doesn't limit turn-in) |
| Assignments | Create/edit guided and open-ended assignments; manage drafts and publication; change instructions, files, expected output, and evaluation configuration |
| Review and Notes | Open submitted snapshots and saved student work; review expected versus actual output and completion results; add notes and student feedback; inspect every submission, return, and resubmission |
| Assistance and Help | See help alerts and active students (a class list, not a seating chart: there is no assigned seating); join work directly with notification; view/edit/run code; use labeled cursors; send guidance |
| Settings | Edit approved behavior settings: current school year and time zone. There are no turn-in window settings (D13) |
| Change History | Inspect recorded admin changes to student records, logins, curricula, lessons, assignments, schedules, and settings |

Configurable functionality means exposing controls for approved product behavior. New features still require discussion before they appear in the specification or dashboard.

### Data-editing and UI requirements

- Student curriculum changes retain identity, old work, submitted versions, and history.
- Changing a student login is an explicit admin action. Validate uniqueness across all students and retain the student's internal identity and work; display the updated code for ticket reprinting.
- Schedule controls show the target year, lesson, effective date/time, and time zone. Unscheduled lessons must not acquire invented dates.
- Content, expected-output, and configuration edits cannot silently overwrite student files, prior submissions, or historical check results.
- Notes associated with student review must be clearly distinguished from execution output and automated check results. Written feedback is optional and student-visible; a separate private note is visible to admins only (D07).
- Use contextual forms with validation and save feedback for editable data rather than exposing arbitrary database fields.
- Separate live assistance from review of a submitted snapshot, while preserving a clear path between them.
- Use a persistent dashboard navigation with the selected group/curriculum/year visible where relevant. Below 1280 px it collapses into a compact top bar with a Menu (D17).
- Every admin screen works on a phone at 375 px wide with no sideways page scrolling and touch targets of about 44 px; finding an assignment (Assignments, Curriculum's day and assignment list, the Review queue) comes first. See [responsive breakpoints](ui-design.md#responsive-breakpoints).
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
- Attendance is Present, Late or Absent for the group’s current lesson date (D11) and remains separate from online presence.

D03 was approved on October 27, 2026. Import CSV exports (UTF-8, header row, up to 100 students and 1 MB per batch). Map first name and last name; map an existing login-code column when returning students are included. Header names are not fixed. Extra columns are ignored.

Select the target group and curriculum before previewing. Each row defaults to returning; an admin must explicitly check New student for every new identity and leave its existing-code field empty. Returning rows require a known login code; names are never used to merge identities. Same-name new students get a warning and distinct, automatically allocated codes. Preview shows existing identity/group/curriculum, proposed names, codes and row errors before any writes. Returning imports update the name and assignment while preserving identity, code, original year, avatar and all work; students omitted from a file are unchanged.

Imports are atomic and admin-only. Duplicate returning identities, missing names, unknown codes and wrong-group curricula are refused. A stale preview must be reviewed again; retries reuse a receipt to avoid duplicate students or history after a lost response. Every changed student has a history entry with the acting admin, time and previous/new values. Unchanged rows add no change history.

Print tickets previews the selected group's saved roster. Reprint ticket in the student drawer prints that student's saved details after edits are saved. Check or edit the website address in the preview, then use Print / Save PDF. Tickets include the saved name and code, website address and sign-in instructions; app navigation is excluded from print output.

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
- Explain that changing a date moves only the lesson date; turn-in never closes (D06, D13).
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
- Show all submission attempts and returns on the admin dashboard, including the saved version, timestamp, check result, and associated feedback for each attempt.

UI requirements:

- Keep student identity, group, lesson day, and assignment visible during assistance/review.
- Distinguish a live working copy from a submitted snapshot.
- Distinguish the latest submission and its review state from earlier attempts. A new submission must not appear reviewed merely because an earlier attempt was reviewed.
- Show help alert status and avoid duplicate alerts for the same unresolved request.
- Distinguish connected, disconnected, and stale student presence.

### Classroom list

Assistance lists students by last name, with live presence and the latest saved assignment. Select a student or help request to open their saved work, join collaborative editing, run Python or leave guidance. There is no assigned seating (D14).

### Deleting a student

Select a student’s name in Students, then choose **Delete student** in their details panel and confirm. Deletion removes the student from active rosters and the classroom list, disables their login and existing-session access, and closes open help requests. Their saved work, submissions, attendance and change history are retained. Login codes remain reserved so a new student cannot inherit an old identity. Deleted students cannot be updated or matched as returning students through roster import.

## Classes and enrollment history

Settings → Classes creates a named class with an assigned year (`2027` or `2027-28`).
Classes default to Current; Upcoming classes can be planned before starting them.
The header class selector switches Students, Curriculum, Assignments, Assistance,
and Review together. Each newly created class has its own empty curriculum.
The original Basic and Advanced groups are adopted without changing their data.

Choose a class when adding a student. To reuse a returning student's identity and
login code, use Settings → Enroll returning student, or Class involvement in the
student drawer. Upcoming enrollment leaves the student's active placement alone;
Start class activates its enrollments. Moving between current classes within the
same year replaces the enrollment; enrollment in another year preserves prior
participation, work, submissions, and attendance.

Mark as over requires confirmation and permanently archives the class. Archives
leave the header selector and remain accessible from Settings → Archived classes.
The archive shows curriculum, assignment content, and the retained roster.
Server checks reject edits to archived curriculum, attendance, work, checks,
turn-ins, feedback, and enrollment, including changes through old open tabs.

Class management uses the selected class directly. Lessons (formerly Curriculum)
shows that class’s lessons and assigned year, without a separate curriculum or
year selector. Student creation, editing and roster import automatically use
the chosen class’s content; there is no separate curriculum assignment to manage.

### Reusing lessons and returning students

- Lessons → Import lessons: choose another class (including archives) and select
  up to ten lessons per import. The copies include slides, covers and assignment
  content/check rules/starter files, with new independent records. Dates are left
  unset and assignments are drafts for review before publication. Previously
  imported source lessons are skipped, including retries.
- Students → Find returning student: search all retained student identities by
  first name, last name, full name or exact login code. Results show their last
  class, original year and existing code so namesakes can be distinguished.
  Add to class reuses the identity and history; Restore and add also reactivates
  a removed student. Already enrolled students cannot be added twice. Upcoming
  enrollment preserves current placement; same-year current enrollment moves it.

Archived classes have a Delete button in Settings. Confirmation removes the class
from the archive list and lesson-import source choices. This is a soft deletion:
student involvement, attendance, lessons and saved work remain intact. Only
admins can delete classes, and current/upcoming classes must be archived first.

### Reusing a room layout

Assistance → Classroom → Import room layout lets you choose another class,
including an archived class, and preview its desk positions and rotations.
The preview opens in classroom edit mode: adjust it and Save layout, or Cancel
to keep the existing room. Source students are never copied. Destination students
keep matching seat numbers; those whose desks are absent become unseated.
The existing layout revision and roster checks protect against concurrent edits.

Student desks show red **Away** while the app tab is hidden or its window loses focus, and return to their normal state when the student comes back. Focus is separate from idle activity and is aggregated across browser tabs; another focused app tab keeps the student present. Offline desks retain their disconnected appearance. This reports app visibility/focus, not what the student is doing elsewhere, and does not store a browsing history.
