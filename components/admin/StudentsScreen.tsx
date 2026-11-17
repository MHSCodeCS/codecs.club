"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
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
import { PhoneSheet } from "@/components/ui/PhoneSheet";
import { useGroup } from "./GroupContext";
import { StudentDrawer } from "./StudentDrawer";

/** 4f. Roster for the selected group, attendance and student edits. */
export function StudentsScreen() {
  const { group } = useGroup();
  const now = useNow();
  const roster = useQuery(api.adminStudents.roster, { group, now });
  const markAttendance = useMutation(api.adminStudents.markAttendance);
  const [taking, setTaking] = useState(true);
  const [selectedId, setSelectedId] = useState<Id<"students"> | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  if (roster === undefined) return <LoadingState label="Loading students…" />;

  const selected = roster.students.find((s) => s._id === selectedId) ?? null;
  const curriculumNames = [
    ...new Set(
      roster.students
        .map((s) => roster.curricula.find((c) => c._id === s.curriculumId)?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const lesson = roster.attendanceLesson;

  async function mark(studentId: Id<"students">, status: AttendanceStatus) {
    if (!lesson) return;
    setAttendanceError(null);
    try {
      await markAttendance({ studentId, scheduleId: lesson.scheduleId, status });
    } catch (err) {
      setAttendanceError(errorMessage(err, "Attendance wasn’t saved. Try again."));
    }
  }

  return (
    <main className="flex flex-col pb-10">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-4 pt-4 md:px-7">
        <h1 className="m-0 text-[34px] leading-[1.04] font-extrabold tracking-[-.035em] md:text-[46px]">
          Students
        </h1>
        <span className="pb-1.5 text-sm text-ink3">
          {roster.students.length} in {group}
          {curriculumNames.length > 0 && ` · ${curriculumNames.join(", ")}`} {formatYear(roster.year)}
        </span>
        <div className="flex flex-wrap gap-2 max-md:w-full max-md:[&>button]:h-11 md:ml-auto">
          <Button variant="secondary" size="lg" disabled title="Roster import arrives in Phase 8.">
            Import roster
          </Button>
          <Button variant="secondary" size="lg" disabled title="Ticket printing arrives in Phase 8.">
            Print tickets
          </Button>
          <Button
            variant={taking ? "primary" : "secondary"}
            size="lg"
            aria-pressed={taking}
            onClick={() => setTaking((t) => !t)}
            disabled={!lesson}
            title={lesson ? undefined : "No lesson is scheduled yet for this group."}
          >
            {taking ? "✓ Taking attendance" : "Take attendance"}
          </Button>
        </div>
      </div>

      {attendanceError && (
        <div role="alert" className="mx-4 mt-3 rounded-xl bg-cor-s px-4 py-2.5 text-sm text-cor-i md:mx-7">
          {attendanceError}
        </div>
      )}

      <div
        className={cn(
          "grid gap-5 px-4 pt-3 md:px-7",
          selected && "lg:grid-cols-[minmax(0,1fr)_380px]",
        )}
      >
        {roster.students.length === 0 ? (
          <EmptyState title={`No students in ${group} yet`}>
            Import a roster to add students to this group.
          </EmptyState>
        ) : (
          <div className="flex min-w-0 flex-col">
            {/* Phones stack each row, so the attendance date moves above the list. */}
            <p className="m-0 border-b border-ln pb-2 text-[13px] font-semibold text-ink3 md:hidden">
              {lesson
                ? `Attendance · ${formatWeekdayDate(lesson.lessonAt, roster.timeZone)}`
                : "Attendance · no lesson yet"}
            </p>
            <div role="table" aria-label={`${group} roster`}>
              <div
                role="row"
                className="hidden h-[34px] grid-cols-[minmax(0,1fr)_118px_300px] items-center gap-3 border-b border-ln px-3.5 text-[13px] font-semibold text-ink3 md:grid"
              >
                <span role="columnheader">Student</span>
                <span role="columnheader">Login code</span>
                <span role="columnheader">
                  {lesson
                    ? `Attendance · ${formatWeekdayDate(lesson.lessonAt, roster.timeZone)}`
                    : "Attendance · no lesson yet"}
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
                      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-ln px-3 py-2 md:h-12 md:grid-cols-[minmax(0,1fr)_118px_300px] md:px-3.5 md:py-0",
                      isSelected ? "bg-mint-s" : "hover:bg-sf",
                    )}
                  >
                    <span role="cell" className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected ? null : student._id)}
                        className="max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left font-bold text-ink hover:underline max-md:min-h-11"
                      >
                        {name}
                      </button>
                    </span>
                    <span role="cell" className="font-mono text-sm font-medium">
                      {student.loginCode}
                    </span>
                    <span role="cell" className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
                      {lesson ? (
                        <>
                          <AttendanceControl
                            studentName={name}
                            value={student.attendance}
                            disabled={!taking}
                            highlightUnmarked={taking}
                            onChange={(status) => void mark(student._id, status)}
                          />
                          {taking && student.attendance === null && (
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
          </div>
        )}
        {selected && (
          <PhoneSheet
            open
            onClose={() => setSelectedId(null)}
            title={`${selected.firstName} ${selected.lastName}`}
            backLabel="Students"
          >
            <StudentDrawer
              key={selected._id}
              student={selected}
              curricula={roster.curricula}
              onClose={() => setSelectedId(null)}
            />
          </PhoneSheet>
        )}
      </div>
    </main>
  );
}
