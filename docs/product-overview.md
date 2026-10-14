# Product Overview

Code CS is an in-house-designed, provider-hosted Colab replacement for middle-school students learning Python. Convex Cloud is the backend; browser Python execution is the priority.

These are agreed requirements, not implemented features. See [deployment status](deployment.md) and [decisions and verification](decisions-and-verification.md). Only agreed features enter these specifications; pending decisions are recorded separately.

## Capacity requirement

- Plan for **1,000 unique students over the website's lifetime**, including former students whose work and login access remain available.
- Support a maximum expected load of **50 simultaneously active students**, in addition to admin sessions.
- Plan and validate for active assignment editing, browser Python execution, autosave, output checks, help requests, and teacher assistance, rather than only 50 idle logins.
- Student work and assistance must remain responsive at this load. Validate database traffic and collaborative updates under representative concurrent use before deployment.
- This is a planning and validation target, not a hard login limit or a claim that capacity has already been tested.

## Core structure

- There are exactly two persistent groups: **basic** and **advanced**. Basic is the beginner curriculum.
- There are no classes or annually recreated class groups. Both groups persist for the lifetime of the website.
- Each student has a persistent identity, name-based login code, current group, and curriculum assignment stored in Convex.
- Teachers can change a student's group and curriculum on the fly based on skill level.
- Moving a student must preserve their identity, login code, completed assignments, saved work, submissions, feedback, and version history.
- Former students retain access to their own work through the same login while the website remains available.
- Years distinguish lesson schedules and work history; they do not create additional groups or separate student identities.

## Agreed feature inventory

| Area | Requirement |
| --- | --- |
| Student login | Persistent first-initial-plus-last-name code, with a numeric suffix for duplicates; printed login ticket |
| Admin login | Specific username/password accounts stored in Convex |
| Admin dashboard | All teaching, content management, student management, review, assistance, and approved configuration features |
| Admin change history | Record who changed managed data/settings, when, and what changed |
| Student intake | Import roster information from a spreadsheet into Convex and assign basic or advanced curriculum |
| Curriculum management | Change student group and curriculum immediately without losing history |
| Learning structure | Curriculum days dedicated to topics, each with slides and assignments |
| Scheduling | Lesson dates and times supplied and changed by admins for each year |
| Guided assignments | LeetCode-style Python tasks checked against expected output, ignoring whitespace; infinite-loop checks observe up to 1,000 iterations |
| Open-ended assignments | Python projects and finals without a required guided-output structure |
| IDE | Python editing, Run, Stop, output, files, imports, libraries, and pip support |
| Persistence | Autosave to Convex, resume work, and version history |
| Progress | Assignment progress plus completion, partial completion, or no completion for guided checks |
| Turn-in | Submit a saved version for review; after return, edit/resubmit regardless of completion result until the deadline |
| Turn-in cutoff | Admin-editable lesson-relative window and closing time; approximately two weeks was requested |
| Remote assistance | Teachers join directly with a student notification; simultaneous editing with labeled teacher cursors |
| Teacher capabilities | View, edit, run student code, and send guidance |
| Help requests | Student help button alerts the teacher |
| Assignment authoring | Create guided/open-ended work, save drafts, and publish to the appropriate curriculum days |
| Attendance | Teacher attendance recording, organized around the two groups and lesson dates |

Numerical grades are not required. Guided output evaluation supplies completion information; teachers can check turned-in work and provide feedback without a numerical grading system.

## Terminology and boundaries

- Group means basic or advanced; basic is beginner. Day means an ordered topic unit, not a fixed date. Lesson schedules associate days with actual dates/times for a year.
- Admins perform teaching and management; teacher assistance is an admin acting as teacher, not a separate Google-login role.
- Working copies are editable files; submissions are preserved snapshots; guided completion is separate from execution, saving, submitting, and reviewing.
- No classes, extra languages, numerical grades, AI judge, or anti-cheating system are required.
- No custom database/file backup feature or separate backup system.
- NocoDB was discussed but not adopted. Convex remains the backend and development is connected.
- No student Python installation, extension, or Linux setup is required.

See the [documentation index](README.md) for detailed feature guides.
