"use client";
import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { TextInput, FieldError } from "@/components/ui/Field";
import { errorMessage } from "@/lib/errors";
import { useGroup } from "./GroupContext";
import type { CurriculumOption } from "./StudentDrawer";

export function AddLessonForm({ curricula, timeZone, onSaved, onClose }: {
  curricula: CurriculumOption[]; timeZone: string; onSaved: (id: Id<"lessonSchedules">) => void; onClose: () => void;
}) {
  const schedule = useMutation(api.adminCurriculum.addLesson);
  const { group, selectedClass } = useGroup();
  const curriculumId = curricula.filter(c => c.group === group).at(-1)?._id;
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("16:00");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving || !curriculumId) return;
    setSaving(true); setError(null);
    try { onSaved(await schedule({ curriculumId, topic, date, time, endTime })); }
    catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
  }
  return <form aria-label="Add lesson" onSubmit={submit} className="mx-7 mt-4 flex max-w-xl flex-col gap-3 rounded-3xl bg-sf p-5">
    <h2 className="m-0 text-2xl font-extrabold">Add lesson</h2>
    <p className="m-0 text-sm text-ink3">Adds a lesson to {selectedClass?.name ?? "this class"} for {selectedClass?.year ?? "its assigned year"}. Its date also sets the assignment turn-in window. Times use {timeZone}.</p>
    {!curriculumId ? <p>Select a class before scheduling a lesson.</p> : <>
      <label className="flex flex-col gap-1 text-sm font-bold">Lesson topic<TextInput required maxLength={100} value={topic} onChange={e => setTopic(e.target.value)} /></label>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm font-bold">Lesson date<TextInput type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">Start time<TextInput type="time" required value={time} onChange={e => setTime(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">End time<TextInput type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} /></label>
      </div>
    </>}
    {error && <FieldError id="attendance-lesson-error">{error}</FieldError>}
    <div className="flex gap-2"><Button type="submit" disabled={!curriculumId} loading={saving} loadingLabel="Scheduling…">Add lesson</Button><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button></div>
  </form>;
}
