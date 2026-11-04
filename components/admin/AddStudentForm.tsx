"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput, FieldError } from "@/components/ui/Field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { useGroup, type Group } from "./GroupContext";
import type { CurriculumOption } from "./StudentDrawer";

export function AddStudentForm({ group, curricula, onAdded, onClose }: {
  group: Group; curricula: CurriculumOption[]; onAdded: (id: Id<"students">) => void; onClose: () => void;
}) {
  const { classes } = useGroup();
  const [selectedGroup, setSelectedGroup] = useState(group);
  const create = useMutation(api.adminStudents.createStudent);
  const options = curricula.filter(c => c.group === selectedGroup);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const curriculumId = options.at(-1)?._id;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const id = await create({ firstName, lastName, group: selectedGroup,
        ...(curriculumId ? { curriculumId } : { curriculumName: classes.find(c => c.group === selectedGroup)?.name ?? "Class lessons" }) });
      onAdded(id);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }
  return <form onSubmit={submit} aria-label="Add student" className="mx-7 mt-4 flex max-w-xl flex-col gap-4 rounded-3xl bg-sf p-5">
    <h2 className="m-0 text-2xl font-extrabold">Add student · {classes.find(c => c.group === selectedGroup)?.name ?? selectedGroup}</h2>
    <label className="flex flex-col gap-1.5 text-sm font-bold">Class<select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} className="h-11 rounded-xl border border-bd bg-bg px-3">{classes.filter(c => c.status !== "archived").map(c => <option key={c._id} value={c.group}>{c.name} · {c.year}</option>)}</select></label>
    <label className="flex flex-col gap-1.5 text-sm font-bold">First name
      <TextInput required maxLength={100} value={firstName} onChange={e => setFirstName(e.target.value)} />
    </label>
    <label className="flex flex-col gap-1.5 text-sm font-bold">Last name
      <TextInput required maxLength={100} value={lastName} onChange={e => setLastName(e.target.value)} />
    </label>

    {error && <FieldError id="add-student-error">{error}</FieldError>}
    <div className="flex gap-2"><Button type="submit" loading={saving} loadingLabel="Adding…">Add student</Button>
      <Button type="button" variant="danger" disabled={saving} onClick={onClose}>Close</Button></div>
  </form>;
}
