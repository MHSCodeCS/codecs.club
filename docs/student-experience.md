# Student Experience

[Documentation index](README.md). Evaluation and submission semantics are also consolidated in [curriculum and assignments](curriculum-and-assignments.md).

## Student flow and UI requirements

### 1. Sign in with a persistent name code

The student enters the code printed on their ticket, based on first initial and last name. Login resolves the same student identity across years; changing group or curriculum does not create a new account or code.

When the base code is already in use, append a number to make the new student's code unique (for example, `jsmith`, `jsmith1`, `jsmith2`). Preserve previously issued codes, including their suffixes, across roster imports and curriculum changes. Login codes must remain unique across both groups and former students.

- Make student login immediately identifiable and admin sign-in visually distinct.
- Label the field and show sign-in progress, invalid-code errors, and a clear retry path.
- Show student identity and a sign-out action once signed in.
- Do not require the student to choose a class, re-register each year, or enter a new annual code.

### 2. See the assigned curriculum

After login, the student sees their current basic or advanced group and assigned curriculum, organized into days/topics such as variables or loops.

- Show curriculum and group context clearly.
- Present days in their learning order with topic titles and scheduled dates when assigned.
- Do not invent dates for unscheduled lessons.
- Show assignments under their day and make progress readable without opening every assignment.
- Keep historical personal work accessible when the current curriculum changes or the student is no longer learning.

### 3. Open a lesson day

Each day includes slides and assignments. Students access the slides and choose the day's work independently.

- Keep slides access beside the day/topic context and assignment list.
- Identify guided work versus open-ended projects/finals using text labels.
- Provide a consistent open/resume action for each assignment.
- Distinguish a day with no assignments from a loading error.
- Preserve lesson context when moving between the day and an assignment.

Admins upload slides associated with a lesson day. Students can open and follow them from that day. Supported upload formats and presentation method will be settled before implementation.

Slide material may be designed in Figma or Google Slides. The authoring tool does not yet determine the delivery format: upload/export versus a hosted link/embed remains undecided. Do not require students to have an authoring-tool account merely because the lesson was designed there.

### 4. Work on an assignment

Guided assignments use a LeetCode-style layout: the task and expected behavior appear beside a Python workspace. Students may write different solutions; evaluation compares behavior against the assignment's expected output rather than requiring identical source code.

Open-ended assignments start with a blank file and support projects/finals. They use the same Python workspace but do not require guided output checks.

- Keep title, curriculum day, task type, and a route back to the lesson visible.
- Place task instructions and expected-output examples alongside the editor for guided work.
- Give the editor the largest working area; keep file tools, imports, and package support accessible.
- Provide Run and Stop controls near the editor and readable output nearby.
- Separate program output, execution errors, and assignment check results.
- Display running, stopped, completed execution, and failed execution distinctly.
- Do not equate successful execution with assignment completion or turn-in.

### 5. Save and check progress

Work always saves to Convex. Students can leave and resume the same files, and version history allows recovery of earlier work.

Guided checks report **completion**, **partial completion**, or **no completion** by evaluating meaningful parts of the assignment against its expected behavior. Each assignment defines its own requirements and the amount of successful work needed for partial completion; a single successful check does not automatically qualify.

- **Completion:** all required parts meet their checks.
- **Partial completion:** some required parts remain unmet, but the assignment-specific minimum for meaningful partial work is met.
- **No completion:** successful work falls below that minimum, even if a small part passes.
- Report which parts passed and which remain unmet, with an understandable reason for the overall outcome.
- Define checks around learning requirements rather than incidental formatting or a particular source-code solution. Avoid giving multiple checks for the same small requirement disproportionate influence.
- Configure the required parts and partial-completion rule in the admin assignment editor. Validate that the rule is attainable and consistent with the full-completion requirements.
- Evaluation is based on explicit assignment rules; it does not require an AI judge or numerical student grades.

Whitespace differences must not make otherwise matching output incorrect: disregard spaces, tabs, and line breaks when comparing expected and actual output, preserving the order and content of non-whitespace characters.

- Show Saving, Saved, and Save failed/disconnected states accurately.
- A local edit is not represented as database-saved until persistence succeeds.
- Preserve pending edits on connection failures and reconcile them on reconnection.
- Warn before navigation that could lose unsaved work.
- Keep work progress distinct from guided-check outcomes and submission state.
- Show a checklist of assignment requirements with met/unmet results alongside the overall completion status, so students know what to revise.
- Preserve original output formatting in the console; whitespace-insensitive comparison applies to checks, not to how output is displayed.
- Expose version history with inspect and restore actions; identify the version being restored.
- Preserve prior work when restoring a version or when a teacher edits.

### 6. Ask for help or receive teacher assistance

The help button alerts the teacher with the student's assignment context. Teachers can also join directly at any time without student acceptance. Joining produces a visible student notification.

Teacher and student edit simultaneously, with labeled teacher cursors. The teacher can view code, edit, run it, and send guidance in the app.

- Keep Help easy to reach without obscuring Run, Stop, or Turn in.
- Show that a help request was sent; do not promise an immediate response.
- Show the assisting teacher's identity, labeled cursor, and active/disconnected state.
- Attribute teacher execution so students understand who initiated a run.
- Keep guidance readable without covering the task, editor, or output.
- Synchronize edits without silently replacing either participant's newer work.
- Preserve work, version history, and guidance after assistance ends.
- Remote assistance does not depend on whether turn-in is still available.

### 7. Turn in final work

Turn in submits a final saved version for teacher checking and feedback. Preserve that version separately from later working-copy edits, so review refers to what was actually submitted.

After review, the teacher can return work with feedback. The student can edit it, review it, and turn it in again. Each resubmission preserves the earlier submitted version and feedback and creates a new submitted snapshot; returned work is not permanently locked.

Resubmission after return is allowed for **completion, partial completion, and no completion** alike, up to the assignment's deadline. A fully completed assignment can still be improved and submitted again; its completion result must not disable resubmission.

Turn-in availability is tied to that year's teacher-supplied lesson date and a closing window. The requested behavior is to prevent turn-in roughly two weeks after the lesson; admins can edit the turn-in window and closing time from the dashboard. The exact default duration is not yet finalized.

- Make Turn in distinct from Run and autosave.
- Save successfully before confirming submission; a failed save cannot produce a successful turn-in message.
- Show submission confirmation and the submitted version/time.
- Show when turn-in closes once its date is known.
- After closing, disable turn-in with a clear explanation; do not imply that saved work is deleted.
- Keep historical work readable and feedback accessible independently of submission availability.
- Separate teacher feedback from automated output-check results.
- Show returned feedback beside a clear edit/resume action and indicate which submitted version was reviewed.
- Show resubmission as a new submission without erasing the previous review.

The configured turn-in deadline applies to both initial submissions and resubmissions. Returning work does not automatically bypass the deadline. After closing, students retain access to editing, work history, and feedback; an admin can change the cutoff through the approved dashboard controls.

### 8. Return and resume

The student returns to the lesson or learning home, with progress and submission state reflecting saved data. Subsequent visits restore work under the same student identity.

- Preserve navigation context and expose the same resume action consistently.
- Keep past work reachable after moving between basic and advanced.
- Former students must be able to reach their work history without requiring active enrollment in a new year.
