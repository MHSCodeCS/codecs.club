"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/States";
import { deskSize, roomBounds, nextDeskPosition, type Desk } from "@/lib/classroomLayout";
import { ImportRoomLayout } from "./ImportRoomLayout";
import { errorMessage } from "@/lib/errors";

type Room = FunctionReturnType<typeof api.assistance.classroom>;
type Layout = FunctionReturnType<typeof api.classroomLayouts.get>;
type Gesture = { kind: "desk"; seat: number; x: number; y: number; startX: number; startY: number; bounds: ReturnType<typeof roomBounds>; scale: number } | { kind: "student"; id: Id<"students">; startX: number; startY: number };

export function ClassroomLayout({ classroom, group, selected, onPick, status, onEditingChange, onPickStudent, selectedStudentId }: {
  onPickStudent?: (person: Room["students"][number]) => void; selectedStudentId?: Id<"students">;
  classroom: Room; group: string; selected: Id<"workspaces"> | null;
  onPick: (id: Id<"workspaces"> | null) => void; status: (id: string) => "Online" | "Idle" | "Away" | "Offline"; onEditingChange: (editing: boolean) => void;
}) {
  const saved = useQuery(api.classroomLayouts.get, { group });
  const save = useMutation(api.classroomLayouts.save);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [selectedDesk, setSelectedDesk] = useState<number | null>(null);
  const [student, setStudent] = useState<Id<"students"> | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(700);
  const actionsMenu = useRef<HTMLDetailsElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const editing = draft !== null;
  const layout = draft ?? saved;
  const hasLayout = Boolean(layout);
  useEffect(() => {
    const closeOutside = (event: globalThis.PointerEvent) => {
      const menu = actionsMenu.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasLayout, editing]);
  useEffect(() => {
    if (!editing) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing]);
  if (!layout) return <LoadingState label="Loading classroom layout…" />;
  const bounds = gesture?.kind === "desk" ? gesture.bounds : roomBounds(layout.desks);
  const margin = editing ? 100 : 0;
  const canvasWidth = bounds.width + margin * 2;
  const canvasHeight = bounds.height + margin * 2;
  const scale = Math.min(1, width / canvasWidth);
  const occupied = new Map(layout.seating.filter(s => s.seat !== null).map(s => [s.seat, s.studentId]));
  const people = new Map(classroom.students.map(p => [p.student._id, p]));
  const assigned = new Map(layout.seating.map(s => [s.studentId, s.seat]));
  function assign(id: Id<"students">, seat: number | null) {
    setDraft(current => {
      if (!current) return current;
      const previous = current.seating.find(s => s.studentId === id)?.seat ?? null;
      const occupant = seat === null ? undefined : current.seating.find(s => s.seat === seat)?.studentId;
      return { ...current, seating: current.seating.map(s => s.studentId === id ? { ...s, seat } : s.studentId === occupant ? { ...s, seat: previous } : s) };
    });
    setStudent(null);
  }
  function updateDesk(seat: number, change: Partial<Desk>) {
    setDraft(current => current && ({ ...current, desks: current.desks.map(d => d.seat === seat ? { ...d, ...change } : d) }));
  }
  function begin(event: PointerEvent, next: Gesture) {
    if (event.button !== 0 || busy) return;
    event.preventDefault();
    suppressClick.current = true;
    root.current?.setPointerCapture(event.pointerId);
    setGesture(next);
    if (next.kind === "student") setDragPoint({ x: event.clientX, y: event.clientY });
  }
  function stop(event: PointerEvent) {
    if (gesture?.kind === "student") {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const desk = target?.closest<HTMLElement>("[data-desk]");
      if (desk && root.current?.contains(desk)) assign(gesture.id, Number(desk.dataset.desk));
      else if (target?.closest("[data-student-sidebar]") && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 6) assign(gesture.id, null);
    }
    setGesture(null);
    setDragPoint(null);
    if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
    // Pointer gestures are handled above; keep their synthetic click from placing twice.
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  }
  return <div ref={root} className="flex min-w-0 flex-col gap-3" onPointerMove={event => {
    if (gesture?.kind === "student") { setDragPoint({ x: event.clientX, y: event.clientY }); return; }
    if (gesture?.kind !== "desk") return;
    const x = Math.max(-5000, Math.min(5000, Math.round((gesture.x + (event.clientX - gesture.startX) / gesture.scale) / 8) * 8));
    const y = Math.max(-5000, Math.min(5000, Math.round((gesture.y + (event.clientY - gesture.startY) / gesture.scale) / 8) * 8));
    updateDesk(gesture.seat, { x, y });
  }} onPointerUp={stop} onPointerCancel={() => { setDragPoint(null); setGesture(null); suppressClick.current = false; }}>
    <div className={`grid items-start gap-3 ${editing ? "lg:grid-cols-[minmax(0,1fr)_250px]" : ""}`}>
      <section aria-label="Classroom seating" className="flex min-h-[calc(100dvh-160px)] w-full min-w-0 flex-col gap-3 overflow-hidden rounded-[22px] bg-sf p-5">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-auto font-bold">Classroom <span className="ml-2 text-xs font-normal text-ink3">{layout.desks.length} desks</span></h2>
      {editing ? <><Button size="sm" disabled={busy || layout.desks.length >= 60} onClick={() => {
        const seat = Array.from({ length: 60 }, (_, i) => i).find(i => !layout.desks.some(d => d.seat === i));
        if (seat === undefined) return;
        setDraft({ ...layout, desks: [...layout.desks, { seat, ...nextDeskPosition(layout.desks), rotation: 0 }] });
        setSelectedDesk(seat);
      }}>+ Add desk</Button><Button size="sm" disabled={busy} onClick={() => { setDraft(null); onEditingChange(false); setError(null); setStudent(null); setSelectedDesk(null); }}>Cancel</Button><Button size="sm" variant="primary" loading={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await save({ group, revision: layout.revision, fingerprint: layout.fingerprint, desks: layout.desks, seating: layout.seating }); setDraft(null); onEditingChange(false); setStudent(null); setSelectedDesk(null); }
        catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
      }}>Save layout</Button></> : <details ref={actionsMenu} className="relative" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }} onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault(); event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
        <summary aria-label="Room actions" title="Room actions" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-bd bg-bg text-2xl leading-none text-ink hover:bg-sf2 focus-visible:outline-2 focus-visible:outline-mint [&::-webkit-details-marker]:hidden">⋮</summary>
        <div className="absolute top-full right-0 z-20 mt-2 flex w-48 flex-col gap-1 rounded-xl border border-bd bg-bg p-1.5 shadow-lg">
          <Button size="sm" className="justify-start" onClick={() => { if (actionsMenu.current) actionsMenu.current.open = false; setImporting(v => !v); setError(null); }}>Import room layout</Button>
          <Button size="sm" className="justify-start" onClick={() => { if (actionsMenu.current) actionsMenu.current.open = false; setDraft(structuredClone(layout)); setImporting(false); onEditingChange(true); setError(null); }}>Edit classroom</Button>
        </div>
      </details>}
    </div>
    {importing && !editing && <ImportRoomLayout group={group} onClose={() => setImporting(false)} onImport={desks => {
      const seats = new Set(desks.map(d => d.seat));
      setDraft({ ...structuredClone(layout), desks, seating: layout.seating.map(s => ({ ...s, seat: s.seat !== null && seats.has(s.seat) ? s.seat : null })) });
      setImporting(false); setStudent(null); setSelectedDesk(null); setError(null); onEditingChange(true);
    }} />}
    {editing && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-mint-s p-3 text-xs text-mint-i">
      <p className="mr-auto flex-1">Drag desks by their handle. Drag a student onto a desk, or select a student then click a desk. Occupied desks swap students.</p>
      <Button size="sm" disabled={busy || selectedDesk === null} onClick={() => { const desk = layout.desks.find(d => d.seat === selectedDesk); if (desk) updateDesk(desk.seat, { rotation: (desk.rotation + 90) % 360 }); }}>↻ Rotate</Button>
      <Button size="sm" variant="danger" disabled={busy || selectedDesk === null} onClick={() => {
        setDraft({ ...layout, desks: layout.desks.filter(d => d.seat !== selectedDesk), seating: layout.seating.map(s => s.seat === selectedDesk ? { ...s, seat: null } : s) }); setSelectedDesk(null);
      }}>Remove desk</Button>
    </div>}

        <p className="mx-auto mb-3 w-1/5 rounded-full bg-sf2 py-1.5 text-center text-[11px] font-bold tracking-wider text-ink2">FRONT OF ROOM</p>
        <div ref={viewport} className="w-full flex-1 content-center">
          <div className="relative mx-auto" style={{ width: canvasWidth * scale, height: canvasHeight * scale }}>
            <div className="absolute origin-top-left" style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${scale})`, ...(editing ? { backgroundImage: "radial-gradient(var(--color-bd) 1px, transparent 1px)", backgroundSize: "16px 16px" } : {}) }}>
              {layout.desks.map(desk => {
                const id = occupied.get(desk.seat);
                const person = id ? people.get(id) : undefined;
                const state = person ? status(person.student.userId) : null;
                const waiting = person && classroom.help.find(h => h.studentId === person.student._id);
                const chosen = editing ? selectedDesk === desk.seat : Boolean(person && (person.student._id === selectedStudentId || (person.workspaceId && person.workspaceId === selected)));
                return <div key={desk.seat} data-desk={desk.seat} className="absolute rounded-xl" style={{ left: desk.x - bounds.x + margin, top: desk.y - bounds.y + margin, ...deskSize(desk) }}>
                  <div aria-hidden="true" className={`pointer-events-none absolute left-1/2 top-1/2 rounded-xl ${editing ? "border-2" : "border"} ${state === "Away" ? `border-cor-i bg-cor-s ${chosen ? "ring-2 ring-cor-i" : "ring-1 ring-cor-i/40"}` : chosen ? "border-mint-i bg-mint-s2 ring-1 ring-mint-i" : waiting ? `${editing ? "border-amb-i" : "border-amb"} bg-amb-s` : editing ? `border-bd ${person && state !== "Offline" ? "bg-bg" : "bg-transparent"}` : state === "Offline" ? "border-dashed border-bd bg-transparent" : person ? "border-transparent bg-bg" : "border-dashed border-ln bg-transparent"}`} style={{ width: desk.rotation % 180 === 0 ? 128 : deskSize(desk).height, height: desk.rotation % 180 === 0 ? 104 : deskSize(desk).width, transform: `translate(-50%, -50%) rotate(${desk.rotation}deg)` }} />
                  {editing && <button type="button" disabled={busy} aria-label={`Move desk ${desk.seat + 1}`} onFocus={() => setSelectedDesk(desk.seat)} className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 touch-none rounded bg-ink px-2 text-xs text-bg cursor-grab active:cursor-grabbing" onPointerDown={event => { setSelectedDesk(desk.seat); begin(event, { kind: "desk", seat: desk.seat, x: desk.x, y: desk.y, startX: event.clientX, startY: event.clientY, bounds, scale }); }} onKeyDown={event => {
                    const delta: Record<string, [number, number]> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
                    if (delta[event.key]) { event.preventDefault(); const [x, y] = delta[event.key]; updateDesk(desk.seat, { x: Math.max(-5000, Math.min(5000, desk.x + x)), y: Math.max(-5000, Math.min(5000, desk.y + y)) }); }
                  }}>⠿</button>}
                  <button type="button" disabled={busy || (!editing && (!person || (!onPickStudent && !person.workspaceId)))} aria-pressed={chosen} aria-label={`Desk ${desk.seat + 1}${person ? `, ${person.student.firstName} ${person.student.lastName}, ${state}` : ", empty"}`} className={`relative flex size-full min-w-0 flex-col gap-0.5 rounded-xl p-2.5 text-left text-xs focus-visible:outline-2 focus-visible:outline-mint ${editing && person ? "touch-none cursor-grab" : ""}`} onPointerDown={event => {
                    if (!editing) return;
                    setSelectedDesk(desk.seat);
                    if (student) { begin(event, { kind: "student", id: student, startX: event.clientX, startY: event.clientY }); return; }
                    if (person) { setStudent(person.student._id); begin(event, { kind: "student", id: person.student._id, startX: event.clientX, startY: event.clientY }); }
                  }} onClick={() => {
                    if (suppressClick.current) return;
                    if (!editing) { if (person && onPickStudent) onPickStudent(person); else onPick(person?.workspaceId ?? null); }
                    else { setSelectedDesk(desk.seat); if (student) assign(student, desk.seat); }
                  }}>
                    {person ? <><b className="truncate text-[13px]">{person.student.firstName} {person.student.lastName.slice(0, 1)}.</b><span className={state === "Online" ? "text-mint-i" : state === "Idle" ? "text-amb-i" : state === "Away" ? "text-cor-i" : "text-ink3"}>{`${state === "Offline" ? "○" : "●"} ${state}`}</span><span className="truncate text-[11px] text-ink3">{person.task ?? "No saved work"}</span></> : <span className="m-auto text-[11px] text-ink3">Empty seat</span>}
                    {person && <span className="mt-auto text-[10px] text-ink3">Seat {desk.seat + 1}</span>}
                  </button>
                </div>;
              })}
              {!layout.desks.length && <p className="p-8 text-center text-sm text-ink3">{editing ? "Add a desk to start your classroom." : "No desks yet. Edit the classroom to add some."}</p>}
            </div>
          </div>
        </div>
      </section>
      {editing && <aside data-student-sidebar className="rounded-2xl border border-ln bg-sf p-3">
        <h3 className="font-bold">Students <span className="text-xs font-normal text-ink3">{layout.seating.filter(s => s.seat === null).length} unseated</span></h3>
        <p className="my-2 text-xs text-ink3">Drop here to unseat. Select a name to place without dragging.</p>
        {student && <Button size="sm" className="mb-2 w-full" disabled={busy} onClick={() => assign(student, null)}>Unseat selected student</Button>}
        <div className="max-h-[560px] space-y-2 overflow-auto">
          {classroom.students.map(p => <button type="button" key={p.student._id} disabled={busy} aria-pressed={student === p.student._id} className={`flex w-full touch-none flex-col rounded-xl border p-3 text-left text-sm cursor-grab ${student === p.student._id ? "border-mint bg-mint-s" : "border-transparent bg-bg"}`} onPointerDown={event => { setStudent(p.student._id); begin(event, { kind: "student", id: p.student._id, startX: event.clientX, startY: event.clientY }); }} onClick={() => { if (!suppressClick.current) setStudent(p.student._id); }}><b>{p.student.firstName} {p.student.lastName}</b><span className="text-xs text-ink3">{assigned.get(p.student._id) == null ? "Unseated" : `Desk ${assigned.get(p.student._id)! + 1}`}</span></button>)}
        </div>
      </aside>}
    </div>
    {gesture?.kind === "student" && dragPoint && <div aria-hidden="true" className="pointer-events-none fixed z-50 rounded-xl bg-ink px-3 py-2 text-sm font-bold text-bg shadow-lg" style={{ left: dragPoint.x + 14, top: dragPoint.y + 14 }}>{people.get(gesture.id)?.student.firstName}</div>}
    {gesture?.kind === "student" && <p role="status" className="text-sm font-bold text-mint-i">Place {people.get(gesture.id)?.student.firstName} on a desk, or drop in the sidebar to unseat.</p>}
    {editing && <p className="text-xs text-ink3">Select a desk to rotate or remove it. Focus its handle and use arrow keys to move it. Changes apply when you save.</p>}
    {error && <p role="alert" className="text-sm text-cor-i">{error}</p>}
  </div>;
}
