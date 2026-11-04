"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { PhoneSheet } from "@/components/ui/PhoneSheet";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { formatWeekdayDate, formatYear } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { AttendanceControl, type AttendanceStatus } from "./AttendanceControl";
import { useGroup } from "./GroupContext";

import { useUnsavedWork } from "./UnsavedWork";
import { AddStudentsDialog } from "./AddStudentsDialog";
import { StudentDrawer } from "./StudentDrawer";
import { LoginTickets, type TicketStudent } from "./LoginTickets";

/** 4f. Roster for the selected group, attendance and student edits. */
export function StudentsScreen() {
  const { group, selectedClass } = useGroup();
  const now = useNow();
  const [lessonSelection, setLessonSelection] = useState<{ group: typeof group; id: Id<"lessonSchedules"> } | null>(null);
  const scheduleId = lessonSelection?.group === group ? lessonSelection.id : undefined;
  const roster = useQuery(api.adminStudents.roster, { group, now, scheduleId });
  const saveAttendance = useMutation(api.adminStudents.saveAttendance);
  const [choosingLesson, setChoosingLesson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{ scheduleId: string; marks: Record<string, AttendanceStatus> }>({ scheduleId: "", marks: {} });
  const [saved, setSaved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tickets, setTickets] = useState<{ students: TicketStudent[]; address: string } | null>(null);
  const [selectedId, setSelectedId] = useState<Id<"students"> | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  useUnsavedWork(draft.scheduleId === scheduleId && Object.keys(draft.marks).length > 0, "attendance");

  if (roster === undefined) return <LoadingState label="Loading students…" />;

  const selected = roster.students.find((s) => s._id === selectedId) ?? null;
  const lesson = scheduleId ? roster.attendanceLesson : null;
  const marks = draft.scheduleId === scheduleId ? draft.marks : {};
  const dirty = Object.keys(marks).length > 0;

  function mark(studentId: Id<"students">, status: AttendanceStatus) {
    if (!lesson || saving) return;
    setAttendanceError(null); setSaved(false);
    setDraft(previous => ({ scheduleId: lesson.scheduleId, marks: { ...(previous.scheduleId === lesson.scheduleId ? previous.marks : {}), [studentId]: status } }));
  }

  async function save() {
    if (!lesson || saving) return;
    setSaving(true); setAttendanceError(null); setSaved(false);
    try {
      await saveAttendance({ scheduleId: lesson.scheduleId, marks: Object.entries(marks).map(([studentId, status]) => ({ studentId: studentId as Id<"students">, status })) });
      setDraft({ scheduleId: lesson.scheduleId, marks: {} }); setSaved(true);
    } catch (err) { setAttendanceError(errorMessage(err, "Attendance wasn’t saved. Your changes are kept; try again.")); }
    finally { setSaving(false); }
  }

  return (
    <main className="flex flex-col pb-10">
      <div className="flex flex-wrap items-end gap-4 px-4 md:px-7 pt-4">
        <h1 className="m-0 text-[34px] md:text-[46px] leading-[1.04] font-extrabold tracking-[-.035em]">Students</h1>
        <span className="pb-1.5 text-sm text-ink3">
          {roster.students.length} in {selectedClass?.name ?? group} ·
          {formatYear(roster.year)}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="lg" onClick={() => { setAdding(true); setSelectedId(null); }}>Add student</Button>
          <Button variant="secondary" size="lg" disabled={!roster.students.length} onClick={() => setTickets({ students: roster.students, address: window.location.origin })}>
            Print tickets
          </Button>
          <Button
            variant={lesson ? "primary" : "warning"}
            size="lg"
            loading={saving}
            loadingLabel="Saving…"
            onClick={() => lesson ? void save() : setChoosingLesson(v => !v)}
          >
            {lesson ? "Save Attendance" : "Select Lesson"}
          </Button>
        </div>
      </div>

      {(choosingLesson || lesson) && <div className="mx-7 mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-sf p-3">
        {choosingLesson ? <label className="flex items-center gap-2 text-sm font-bold">Select lesson
          <select autoFocus aria-label="Attendance lesson" value={scheduleId ?? ""} disabled={saving} onChange={e => {
            if (!e.target.value) return;
            if (dirty && !window.confirm("Discard unsaved attendance changes and select another lesson?")) return;
            setLessonSelection({ group, id: e.target.value as Id<"lessonSchedules"> });
            setDraft({ scheduleId: e.target.value, marks: {} });
            setChoosingLesson(false); setSaved(false); setAttendanceError(null);
          }} className="h-10 max-w-sm rounded-xl border border-bd bg-bg px-3 text-ink">
            <option value="">Choose a lesson</option>
            {roster.lessons.map(l => <option key={l.scheduleId} value={l.scheduleId}>{formatWeekdayDate(l.lessonAt, roster.timeZone)} · Day {l.dayOrder}: {l.topic}</option>)}
          </select>
        </label> : lesson && <>
          <b className="text-sm">{formatWeekdayDate(lesson.lessonAt, roster.timeZone)} · Day {lesson.dayOrder}: {lesson.topic}</b>
          <Button variant="secondary" disabled={saving} onClick={() => setChoosingLesson(true)}>Change lesson</Button>
        </>}
        {!roster.lessons.length && <span className="text-sm text-ink3">No scheduled lessons. Add a lesson in Lessons first.</span>}
        <span role="status" className="text-sm text-ink3">{saving ? "Saving attendance…" : dirty ? "Unsaved attendance changes" : saved ? "✓ Attendance saved" : lesson ? `${roster.students.filter(s => s.attendance !== null).length} of ${roster.students.length} marked · ${roster.timeZone}` : "Select a lesson to take attendance."}</span>
      </div>}
      {adding && <AddStudentsDialog key={group} group={group} curricula={roster.curricula} onClose={() => setAdding(false)} onAdded={id => { setAdding(false); setSelectedId(id); }} />}
      {tickets && <LoginTickets {...tickets} onClose={() => setTickets(null)} />}

      {attendanceError && (
        <div role="alert" className="mx-7 mt-3 rounded-xl bg-cor-s px-4 py-2.5 text-sm text-cor-i">
          {attendanceError}
        </div>
      )}

      <div
        className={cn(
          "grid gap-5 px-4 md:px-7 pt-3",
          selected && "lg:grid-cols-[minmax(0,1fr)_380px]",
        )}
      >
        {roster.students.length === 0 ? (
          <EmptyState title={`No students in ${selectedClass?.name ?? group} yet`}>
            Use Add student to create a student and their login code.
          </EmptyState>
        ) : (
          <div role="table" aria-label={`${selectedClass?.name ?? group} roster`}>
            <div
              role="row"
              className="hidden md:grid h-[34px] grid-cols-[minmax(0,1fr)_118px_300px] items-center gap-3 border-b border-ln px-3.5 text-[13px] font-semibold text-ink3"
            >
              <span role="columnheader">Student</span>
              <span role="columnheader">Login code</span>
              <span role="columnheader">
                {lesson
                  ? `Attendance · ${formatWeekdayDate(lesson.lessonAt, roster.timeZone)}`
                  : "Attendance · select a lesson"}
              </span>
            </div>
            {roster.students.map((student) => {
              const name = `${student.firstName} ${student.lastName}`;
              const isSelected = student._id === selectedId;
              return (
                <div
                  role="row"
                  key={student._id}
                  aria-selected={isSelected}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] py-2 md:py-0 md:h-12 md:grid-cols-[minmax(0,1fr)_118px_300px] items-center gap-3 border-b border-ln px-3.5",
                    isSelected ? "bg-mint-s" : "hover:bg-sf",
                  )}
                >
                  <span role="cell">
                    <button
                      type="button"
                      onClick={() => setSelectedId(isSelected ? null : student._id)}
                      className="flex cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left font-bold text-ink hover:underline"
                    >
                      <Avatar name={name} color={student.avatarColor} />
                      {name}
                    </button>
                  </span>
                  <span role="cell" className="font-mono text-sm font-medium">
                    {student.loginCode}
                  </span>
                  <span role="cell" className="col-span-2 md:col-span-1 flex flex-wrap items-center gap-2">
                    {lesson ? (
                      <>
                        <AttendanceControl
                          studentName={name}
                          value={marks[student._id] ?? student.attendance}
                          disabled={saving}
                          highlightUnmarked
                          onChange={(status) => mark(student._id, status)}
                        />
                        {(marks[student._id] ?? student.attendance) === null && (
                          <Pill tone="amber" className="px-2.5 font-semibold">
                            Not marked
                          </Pill>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-ink3">—</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {selected && (
          <PhoneSheet open onClose={() => setSelectedId(null)} title={`${selected.firstName} ${selected.lastName}`} backLabel="Students">
          <StudentDrawer
            key={selected._id}
            student={selected}
            curricula={roster.curricula}
            onPrint={() => setTickets({ students: [selected], address: window.location.origin })}
            onDeleted={() => {
              setDraft(previous => { const marks = { ...previous.marks }; delete marks[selected._id]; return { ...previous, marks }; });
              setSelectedId(null);
            }}
            onClose={() => setSelectedId(null)}
          />
          </PhoneSheet>
        )}
      </div>
    </main>
  );
}
