"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { FieldError, TextInput } from "@/components/ui/Field";
import { DaysCompleteBar } from "@/components/student/DayTrack";
import { useNow } from "@/lib/useNow";
import { Pill } from "@/components/ui/Pill";
import { useGroup } from "./GroupContext";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { formatShortDate, formatYear } from "@/lib/format";
import type { Group } from "./GroupContext";

export type RosterStudent = {
  _id: Id<"students">;
  avatarColor: string;
  firstName: string;
  lastName: string;
  loginCode: string;
  group: Group;
  curriculumId: Id<"curricula">;
  sinceYear: string;
};

export type CurriculumOption = { _id: Id<"curricula">; name: string; group: Group };

/**
 * Edits one student's login code and class. Identity and all past
 * work stay attached to the same student. Remount with a `key` per student.
 */
export function StudentDrawer({
  student,
  curricula,
  onClose,
  onPrint,
  onDeleted,
}: {
  student: RosterStudent;
  curricula: CurriculumOption[];
  onClose: () => void;
  onPrint: () => void;
  onDeleted: () => void;
}) {
  const { classes } = useGroup();
  const [editing, setEditing] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  function closeMenu() { if (menuRef.current) menuRef.current.open = false; }
  function cancelEdit() {
    setFirstName(student.firstName); setLastName(student.lastName);
    setLoginCode(student.loginCode); setGroup(student.group);
    setError(null); setEditing(false);
  }
  const now = useNow();
  const progress = useQuery(api.adminStudents.studentProgress, { studentId: student._id });
  const attendance = useQuery(api.adminStudents.attendanceDays, { studentId: student._id, group: student.group });
  const updateStudent = useMutation(api.adminStudents.updateStudent);
  const deleteStudent = useMutation(api.adminStudents.deleteStudent);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [firstName, setFirstName] = useState(student.firstName);
  const [lastName, setLastName] = useState(student.lastName);
  const [loginCode, setLoginCode] = useState(student.loginCode);
  const [group, setGroup] = useState<Group>(student.group);
  const curriculumId = group === student.group ? student.curriculumId : curricula.filter(c => c.group === group).at(-1)?._id;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const name = `${student.firstName} ${student.lastName}`;
  const dirty =
    firstName.trim() !== student.firstName || lastName.trim() !== student.lastName ||
    loginCode.trim() !== student.loginCode ||
    group !== student.group;
  const moving = group !== student.group;

  function changeGroup(next: Group) {
    setGroup(next);
    setError(null);
  }

  async function save() {
    if (!curriculumId) { setError("This class is not ready yet. Reload and try again."); return; }
    setSaving(true);
    setError(null);
    try {
      await updateStudent({
        studentId: student._id,
        firstName, lastName,
        loginCode: loginCode.trim(),
        group,
        curriculumId,
      });
      setSavedAt(Date.now());
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside
      aria-busy={deleting}
      aria-label={`${editing ? "Edit" : "Student details for"} ${name}`}
      className="flex flex-col gap-3.5 self-start rounded-[24px] bg-sf p-5"
    >
      <div className="flex items-center gap-3">
        <Avatar name={name} color={student.avatarColor} size={40} className="text-[15px]" />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-2xl leading-[1.1] font-extrabold tracking-[-.03em]">{name}</h2>
          <div className="text-[12.5px] text-ink3">Student since {formatYear(student.sinceYear)}</div>
        </div>
        {editing && dirty ? (
          <Pill tone="amber" className="h-6 px-2.5">
            ● Unsaved
          </Pill>
        ) : savedAt ? (
          <Pill tone="mint" className="h-6 px-2.5">
            ✓ Saved
          </Pill>
        ) : null}
        <details ref={menuRef} className="relative" onKeyDown={event => { if (event.key === "Escape") { closeMenu(); menuRef.current?.querySelector("summary")?.focus(); } }}>
          <summary aria-label="Student actions" className="flex size-9 cursor-pointer list-none items-center justify-center rounded-xl text-xl font-bold text-ink2 hover:bg-sf2 [&::-webkit-details-marker]:hidden">⋮</summary>
          <div className="absolute top-11 right-0 z-20 flex w-44 flex-col gap-1 rounded-2xl border border-bd bg-bg p-1.5 shadow-card">
            <Button variant="ghost" className="justify-start" disabled={saving || deleting} onClick={() => { setEditing(true); setConfirmDelete(false); closeMenu(); }}>Edit student</Button>
            <Button variant="danger" className="justify-start" disabled={saving || deleting} onClick={() => { setConfirmDelete(true); setError(null); closeMenu(); }}>Delete student</Button>
          </div>
        </details>
      </div>

      {editing && <>
      <label className="flex flex-col gap-1.5 text-sm font-bold">First name
        <TextInput value={firstName} maxLength={100} onChange={e => setFirstName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">Last name
        <TextInput value={lastName} maxLength={100} onChange={e => setLastName(e.target.value)} />
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="student-login-code" className="text-sm font-bold">
          Login code
        </label>
        <div className="flex flex-wrap gap-2">
          <TextInput
            id="student-login-code"
            mono
            value={loginCode}
            onChange={(event) => setLoginCode(event.target.value)}
            className="h-11 min-w-0 flex-1 text-sm font-medium"
            autoCapitalize="none"
            spellCheck={false}
          />
          <Button
            variant="secondary"
            className="h-11 bg-bg px-[18px]"
            disabled={dirty || saving}
            title={dirty ? "Save changes before printing the updated ticket." : "Print the saved login code."}
            onClick={onPrint}
          >
            Reprint ticket
          </Button>
        </div>
        <span className="text-[12.5px] text-ink3">
          Must be unique across all students, past and present.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id="student-group-label" className="text-sm font-bold">
          Class
        </span>
        <select aria-label="Class" value={group} onChange={e => changeGroup(e.target.value)} className="h-11 rounded-xl border border-bd bg-bg px-3">
          {classes.filter(c => c.status !== "archived").map(c => <option key={c._id} value={c.group}>{c.name} · {c.year}</option>)}
        </select>
      </div>

      {moving && (
        <p className="m-0 rounded-[14px] bg-amb-s px-3.5 py-3 text-sm">
          Moves {student.firstName} from{" "}
          <b className="font-bold">
            {classes.find(c => c.group === student.group)?.name ?? student.group}
          </b>{" "}
          to{" "}
          <b className="font-bold">
            {classes.find(c => c.group === group)?.name ?? group}
          </b>
          . Their login code, saved work and submissions stay.
        </p>
      )}

      {error && <FieldError id="student-drawer-error">{error}</FieldError>}

      <div className="flex flex-wrap items-center gap-2 max-md:[&>button]:h-11">
        <Button
          variant="primary"
          className="h-[42px] px-[18px]"
          disabled={!dirty || deleting}
          loading={saving}
          loadingLabel="Saving…"
          onClick={() => void save()}
        >
          Save change
        </Button>
        <Button variant="secondary" className="h-[42px] bg-bg px-[18px]" disabled={saving || deleting} onClick={cancelEdit}>
          Cancel
        </Button>
        <Link href="/admin/history" className="ml-auto text-sm font-semibold">
          Change history
        </Link>
      </div>
      </>}
      {!editing && progress && <section aria-label="Class progress" className="flex flex-col gap-3 border-t border-ln pt-3.5">
        <h3 className="m-0 text-lg font-bold">{progress.className} <span className="text-sm font-normal text-ink3">· {formatYear(progress.year)}</span></h3>
        <div className="[&>div]:w-full"><DaysCompleteBar days={progress.days} now={now} timeZone={progress.timeZone} /></div>
        <div className="grid grid-cols-1 gap-2">
          {progress.days.map(day => {
            const turnedIn = day.assignments.filter(assignment => assignment.turnedIn).length;
            const awaitingReview = day.assignments.some(assignment => assignment.turnedIn && !assignment.reviewed);
            const incomplete = day.assignments.some(assignment => assignment.reviewed && assignment.reviewDecision === "needsWork");
            const complete = !incomplete && day.assignments.length > 0 && turnedIn === day.assignments.length && !awaitingReview;
            const started = day.assignments.some(assignment => assignment.started);
            const colors = incomplete ? "bg-cor-s text-cor-i" : awaitingReview ? "bg-amb-s text-amb-i" : complete ? "bg-mint-s text-mint-i" : started ? "bg-amb-s text-amb-i" : "bg-bg text-ink3";
            const reviewAssignment = day.assignments.find(assignment => assignment.turnedIn && !assignment.reviewed);
            return <article key={day._id} className={`relative flex min-w-0 flex-col gap-1 rounded-2xl p-3 ${colors}`}>
              {reviewAssignment && <Link href={`/admin/review?assignmentId=${reviewAssignment._id}&studentId=${student._id}`} aria-label={`Review Day ${day.order}: ${day.topic} for ${name}`} className="absolute inset-0 z-10 rounded-2xl transition-colors hover:bg-amb/10 focus-visible:bg-amb/10 focus-visible:outline-2 focus-visible:outline-amb" />}
              <span className="text-xs font-semibold">Day {day.order} · {day.lessonAt === null ? "Unscheduled" : formatShortDate(day.lessonAt, progress.timeZone)}</span>
              <b className="text-sm leading-snug">{day.topic}</b>
              {day.assignments.length === 0 ? <span className="pt-2 text-xs">No assignments</span> : <>
                <span className="pt-1 text-xs font-bold">{turnedIn} of {day.assignments.length} turned in</span>
                <ul className="m-0 mt-1 flex list-none flex-col gap-2 border-t border-current/15 p-0 pt-2">
                  {day.assignments.map(assignment => <li key={assignment._id} className="flex items-start justify-between gap-2 text-xs">
                    <span className="min-w-0 font-semibold">{assignment.title}</span>
                    <span className="shrink-0">{assignment.turnedIn ? assignment.reviewed ? assignment.reviewDecision === "needsWork" ? "Incomplete" : "✓ Reviewed" : "Awaiting review" : assignment.started ? "In progress" : "Not started"}</span>
                  </li>)}
                </ul>
              </>}
            </article>;
          })}
        </div>
      </section>}
      {!editing && <section className="flex flex-col gap-3 border-t border-ln pt-3.5" aria-label="Attendance">
        <h3 className="m-0 text-sm font-bold">Attendance</h3>
        {attendance === undefined ? <p className="text-sm text-ink3">Loading attendance…</p> : attendance.days.length === 0 ? <p className="text-sm text-ink3">No camp days yet.</p> : (
          <div className="grid grid-cols-1 gap-2">
            {attendance.days.map(day => {
              const colors = day.status === "present" ? "bg-mint-s text-mint-i" : day.status === "late" ? "bg-amb-s text-amb-i" : day.status === "absent" ? "bg-cor-s text-cor-i" : "bg-bg text-ink3";
              const label = day.status === "present" ? "Present" : day.status === "late" ? "Late" : day.status === "absent" ? "Absent" : "Not marked";
              return <article key={day.dayId} className={`flex min-w-0 flex-col gap-1 rounded-2xl p-3 ${colors}`}>
                <span className="text-xs font-semibold">Day {day.order} · {day.lessonAt === null ? "Unscheduled" : formatShortDate(day.lessonAt, attendance.timeZone)}</span>
                <b className="text-sm leading-snug">{day.topic}</b>
                <span className="mt-auto pt-2 text-xs font-bold">{day.status === "present" ? "✓ " : day.status === "late" ? "◷ " : day.status === "absent" ? "✕ " : ""}{label}</span>
              </article>;
            })}
          </div>
        )}
      </section>}
      {!editing && <Button variant="secondary" className="self-start" onClick={onClose}>Close</Button>}
      {confirmDelete && <div className="border-t border-ln pt-3.5">
        { <div className="flex flex-col gap-3 rounded-xl bg-cor-s p-3 text-sm" role="group" aria-label={`Confirm deletion of ${name}`}>
          <p><b>Delete {name}?</b> They will be removed from the roster and classroom and can no longer sign in. Saved work, submissions and attendance history will be retained.</p>
          <div className="flex gap-2">
            <Button variant="danger" loading={deleting} loadingLabel="Deleting…" disabled={saving} onClick={async () => {
              setDeleting(true); setError(null);
              try { await deleteStudent({ studentId: student._id }); onDeleted(); }
              catch (err) { setError(errorMessage(err)); }
              finally { setDeleting(false); }
            }}>Delete student</Button>
            <Button disabled={deleting} onClick={() => setConfirmDelete(false)}>Keep student</Button>
          </div>
        </div>}
        {error && !editing && <FieldError id="student-delete-error">{error}</FieldError>}
      </div>}
    </aside>
  );
}
