"use client";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useNow } from "@/lib/useNow";
import { useGroup } from "./GroupContext";
export function ClassArchive() {
  const { group, selectedClass } = useGroup();
  const now = useNow();
  const curriculum = useQuery(api.adminCurriculum.overview, { group });
  const roster = useQuery(api.adminStudents.roster, { group, now });
  const [tab, setTab] = useState("curriculum");
  return <main className="flex flex-col gap-4 px-7 pb-10">
    <h1 className="text-4xl font-extrabold">{selectedClass?.name} · {selectedClass?.year}</h1>
    <nav aria-label="Archive sections" className="flex gap-3"><button className="rounded-xl border border-bd px-4 py-2" aria-pressed={tab === "curriculum"} onClick={() => setTab("curriculum")}>Lessons</button><button className="rounded-xl border border-bd px-4 py-2" aria-pressed={tab === "students"} onClick={() => setTab("students")}>Students ({roster?.students.length ?? "…"})</button></nav>
    {tab === "curriculum" ? curriculum?.days.map(day => <section key={day._id} className="rounded-2xl bg-sf p-5"><h2 className="text-xl font-bold">{day.order}. {day.topic}</h2><p className="text-sm text-ink3">{day.schedule ? new Intl.DateTimeFormat("en-US", { timeZone: curriculum.timeZone, dateStyle: "medium", timeStyle: "short" }).format(day.schedule.lessonAt) : "Unscheduled"}</p>{day.slidesUrl && <a href={day.slidesUrl} target="_blank" rel="noreferrer">Open slides</a>}{day.assignments.map(a => <ArchivedAssignment key={a._id} id={a._id} title={a.title} />)}</section>) : <div className="rounded-2xl bg-sf p-5">{roster?.students.map(s => <ArchivedStudent key={s._id} studentId={s._id} name={`${s.firstName} ${s.lastName}`} />)}</div>}
    {tab === "curriculum" && curriculum?.days.length === 0 && <p>No lessons were added to this class.</p>}
  </main>;
}
function ArchivedAssignment({ id, title }: { id: Id<"assignments">; title: string }) {
  const [open, setOpen] = useState(false);
  const data = useQuery(api.adminAssignments.get, open ? { assignmentId: id } : "skip");
  return <div className="mt-3 border-t border-ln pt-3"><button className="font-bold underline" aria-expanded={open} onClick={() => setOpen(!open)}>{title}</button>{open && data && <div className="mt-2 whitespace-pre-wrap text-sm"><p>{data.revision?.summary}</p><p>{data.revision?.instructions}</p>{data.revision?.starterFiles.map(f => <pre key={f.name} className="mt-3 overflow-auto rounded-xl bg-bg p-3">{f.name}{"\n"}{f.content}</pre>)}<ArchivedWork assignmentId={id} /></div>}</div>;
}

function ArchivedStudent({ studentId, name }: { studentId: Id<"students">; name: string }) {
  const { group } = useGroup();
  const [open, setOpen] = useState(false);
  const attendance = useQuery(api.adminStudents.attendanceDays, open ? { studentId, group } : "skip");
  return <details onToggle={e => setOpen(e.currentTarget.open)} className="border-b border-ln py-2"><summary>{name} · Attendance history</summary>{attendance?.days.map(day => <p key={day.dayId}>Day {day.order} · {day.topic} · {day.status ?? "Unmarked"}</p>)}</details>;
}
function ArchivedWork({ assignmentId }: { assignmentId: Id<"assignments"> }) {
  const data = usePaginatedQuery(api.archiveRecords.workspaces, { assignmentId }, { initialNumItems: 10 });
  return <section><h3 className="font-bold">Saved student records</h3>{data.results.map(w => <ArchivedWorkspace key={w._id} id={w._id} name={w.name} />)}{data.status === "CanLoadMore" && <button onClick={() => data.loadMore(10)}>More students</button>}</section>;
}
function ArchivedWorkspace({ id, name }: { id: Id<"workspaces">; name: string }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={e => setOpen(e.currentTarget.open)}><summary>{name}</summary>{open && <WorkspaceRecords id={id} />}</details>;
}
function WorkspaceRecords({ id }: { id: Id<"workspaces"> }) {
  const files = useQuery(api.archiveRecords.files, { workspaceId: id });
  const submissions = usePaginatedQuery(api.archiveRecords.submissions, { workspaceId: id }, { initialNumItems: 5 });
  return <div><h4>Saved working copy</h4>{files?.map(f => <pre key={f._id} className="overflow-auto bg-bg p-3">{f.name}{"\n"}{f.content}</pre>)}<h4>Submitted snapshots and feedback</h4>{submissions.results.map(s => <section key={s._id}><b>Attempt {s.attempt} · {s.reviewDecision ?? s.status}</b>{s.version?.files.map(f => <pre key={f.name} className="overflow-auto bg-bg p-3">{f.name}{"\n"}{f.content}</pre>)}<ArchivedFeedback id={s._id} /></section>)}{submissions.status === "CanLoadMore" && <button onClick={() => submissions.loadMore(5)}>More submissions</button>}</div>;
}
function ArchivedFeedback({ id }: { id: Id<"submissions"> }) {
  const data = usePaginatedQuery(api.archiveRecords.feedback, { submissionId: id }, { initialNumItems: 10 });
  return <div>{data.results.map(f => <p key={f._id}>{f.visibility === "private" ? "Private note" : "Feedback"}: {f.body}</p>)}{data.status === "CanLoadMore" && <button onClick={() => data.loadMore(10)}>More feedback</button>}</div>;
}
