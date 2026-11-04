"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Id } from "@/convex/_generated/dataModel";
import { AddStudentForm } from "./AddStudentForm";
import { FindStudent } from "./FindStudent";
import { RosterImport } from "./RosterImport";
import { useGroup, type Group } from "./GroupContext";
import type { CurriculumOption } from "./StudentDrawer";

export function AddStudentsDialog({ group, curricula, onClose, onAdded }: {
  group: Group; curricula: CurriculumOption[]; onClose: () => void; onAdded: (id: Id<"students">) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { selectedClass } = useGroup();
  const [mode, setMode] = useState<"create" | "find" | "import">("create");
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const options = [{ id: "create", label: "Create new student" }, { id: "find", label: "Find existing student" }, { id: "import", label: "Import roster" }] as const;
  return <dialog ref={dialog} aria-labelledby="add-students-title" onCancel={onClose}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(900px,calc(100%-32px))] overflow-auto rounded-[24px] border border-bd bg-bg p-0 text-ink shadow-card backdrop:bg-black/60">
    <div className="flex items-start justify-between gap-4 px-6 pt-6">
      <div><h2 id="add-students-title" className="m-0 text-3xl font-extrabold tracking-[-.03em]">Add student</h2>
        <p className="mt-1 text-sm text-ink3">{selectedClass?.name ?? group} · {selectedClass?.year}</p></div>
      <Button variant="danger" aria-label="Close Add student" onClick={onClose}>✕</Button>
    </div>
    <div role="group" aria-label="How to add students" className="mx-6 mt-5 flex flex-wrap gap-2 rounded-2xl bg-sf p-1.5">
      {options.map(option => <Button key={option.id} className="flex-1" variant={mode === option.id ? "primary" : "ghost"} aria-pressed={mode === option.id} onClick={() => setMode(option.id)}>{option.label}</Button>)}
    </div>
    <div className="p-6 [&>form]:m-0 [&>form]:max-w-none [&>form]:bg-sf [&>section]:m-0">
      {mode === "create" && <AddStudentForm group={group} curricula={curricula} onClose={onClose} onAdded={onAdded} />}
      {mode === "find" && <FindStudent onClose={onClose} />}
      {mode === "import" && <RosterImport group={group} curricula={curricula} onClose={onClose} />}
    </div>
  </dialog>;
}
