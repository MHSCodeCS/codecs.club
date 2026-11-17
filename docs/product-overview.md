# Product Overview

Code CS is an in-house-designed, provider-hosted Colab replacement for middle-school students learning Python. It is run by high school students, the admins, who teach the younger students in a club. The basic program runs **6 weeks** with one lesson a week. Convex Cloud is the backend; browser Python execution is the priority.

These are agreed requirements. What is built so far is tracked in the [roadmap](roadmap.md); setup and evidence are in [deployment](deployment.md) and [decisions and verification](decisions-and-verification.md). Only agreed features enter these specifications; pending decisions are recorded separately.

## Capacity requirement

- Plan for **1,000 unique students over the website's lifetime**, including former students whose work and login access remain available.
- Support a maximum expected load of **50 simultaneously active students**, in addition to admin sessions.
- Plan and validate for active assignment editing, browser Python execution, autosave, output checks, help requests, and admin assistance, rather than only 50 idle logins.
- Student work and assistance must remain responsive at this load. Validate database traffic and collaborative updates under representative concurrent use before deployment.
- This is a planning and validation target, not a hard login limit or a claim that capacity has already been tested.

## Core structure

- There are exactly two persistent groups: **basic** and **advanced**. Basic is the beginner curriculum.
- There are no classes or annually recreated class groups. Both groups persist for the lifetime of the website.
- Each student has a persistent identity, name-based login code, current group, and curriculum assignment stored in Convex.
- Admins can change a student's group and curriculum on the fly based on skill level.
- Moving a student must preserve their identity, login code, completed assignments, saved work, submissions, feedback, and version history.
- Former students retain access to their own work through the same login while the website remains available.
- Years distinguish lesson schedules and work history; they do not create additional groups or separate student identities.

## Agreed feature inventory

| Area | Requirement |
| --- | --- |
| Student login | Persistent first-initial-plus-last-name code, with a numeric suffix for duplicates; printed login ticket |
| Admin login | Specific username/password accounts stored in Convex |
| Admin dashboard | All teaching, content management, student management, review, assistance, and approved configuration features; usable on a phone as well as a Chromebook |
| Admin change history | Record who changed managed data/settings, when, and what changed |
| Student intake | Import roster information from a spreadsheet into Convex and assign basic or advanced curriculum |
| Curriculum management | Change student group and curriculum immediately without losing history |
| Learning structure | Curriculum days dedicated to topics, each with slides and assignments; the basic Python Fundamentals curriculum has 6 days, one per week |
| Scheduling | Lesson dates and times supplied and changed by admins for each year |
| Guided assignments | LeetCode-style Python tasks checked against expected output, ignoring whitespace; infinite-loop checks observe up to 1,000 iterations |
| Open-ended assignments | Python projects and finals without a required guided-output structure |
| IDE | Python editing, Run, Stop, output, files, imports, libraries, and pip support |
| Persistence | Autosave to Convex, resume work, and version history |
| Progress | Assignment progress plus completion, partial completion, or no completion for guided checks |
| Turn-in | Submit a saved version for review; after return, edit/resubmit regardless of completion result, at any time. Turn-in never locks: no due date, no late label (D13) |
| Remote assistance | Admins join directly with a student notification; simultaneous editing with labeled admin cursors. No assigned seating (D14) |
| Admin capabilities | View, edit, run student code, and send guidance |
| Help requests | Student help button alerts the admins |
| Assignment authoring | Create guided/open-ended work, save drafts, and publish to the appropriate curriculum days |
| Attendance | Attendance recording by admins, organized around the two groups and lesson dates |

Numerical grades are not required. Guided output evaluation supplies completion information; admins can check turned-in work and provide feedback without a numerical grading system.

## Terminology and boundaries

- Group means basic or advanced; basic is beginner. Day means an ordered topic unit, not a fixed date. Lesson schedules associate days with actual dates/times for a year.
- Admins perform teaching and management; assistance is an admin helping a student, not a separate Google-login role. Admins are students themselves: the app never calls them by a staff title, and students see an admin's first name (“Max reviewed this”) (D15).
- Working copies are editable files; submissions are preserved snapshots; guided completion is separate from execution, saving, submitting, and reviewing.
- No classes, extra languages, numerical grades, AI judge, or anti-cheating system are required.
- No custom database/file backup feature or separate backup system.
- NocoDB was discussed but not adopted. Convex remains the backend and development is connected.
- No student Python installation, extension, or Linux setup is required.

See the [documentation index](README.md) for detailed feature guides.
