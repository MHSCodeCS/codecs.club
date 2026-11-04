"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/errors";
import { useGroup } from "./GroupContext";
export function ImportLessons({ onClose }: { onClose: () => void }) {
  const { group, classes, selectedClass } = useGroup();
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<Id<"days">[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [result, setResult] = useState<string | null>(null);
  const lessons = useQuery(api.adminCurriculum.overview, source ? { group: source } : "skip");
  const importLessons = useMutation(api.adminCurriculum.importLessons);
  return <section aria-label="Import lessons" className="mx-7 mt-4 flex flex-col gap-3 rounded-2xl bg-sf p-5">
    <div className="flex items-center gap-3"><h2 className="mr-auto text-2xl font-bold">Import lessons into {selectedClass?.name}</h2><Button disabled={busy} onClick={onClose}>Close</Button></div>
    <p className="text-sm text-ink3">Copy lessons, slides, covers, and assignments from any class, including archives. Copies can be edited independently. Set new dates after importing; assignments arrive as drafts. Previously imported lessons are skipped.</p>
    <label className="flex flex-col gap-1 text-sm font-bold">Source class<select disabled={busy} value={source} onChange={e => { setSource(e.target.value); setSelected([]); setResult(null); setError(null); }} className="h-11 max-w-md rounded-xl border border-bd bg-bg px-3"><option value="">Choose a class</option>{classes.filter(c => c.group !== group).map(c => <option key={c._id} value={c.group}>{c.name} · {c.year} · {c.status}</option>)}</select></label>
    {source && !lessons && <p role="status">Loading lessons…</p>}
    {lessons && <><div className="flex gap-2"><Button disabled={busy || !lessons.days.length} onClick={() => setSelected(lessons.days.slice(0, 10).map(d => d._id))}>Select first 10</Button><Button disabled={busy || !selected.length} onClick={() => setSelected([])}>Clear selection</Button></div><div className="max-h-80 overflow-auto">{lessons.days.map(day => <label key={day._id} className="flex items-center gap-3 border-b border-ln py-3"><input type="checkbox" disabled={busy || (!selected.includes(day._id) && selected.length >= 10)} checked={selected.includes(day._id)} onChange={e => setSelected(e.target.checked ? [...selected, day._id] : selected.filter(id => id !== day._id))} /><span><b>{day.order}. {day.topic}</b><span className="ml-2 text-sm text-ink3">{day.assignments.length} assignments</span></span></label>)}{!lessons.days.length && <p>No lessons in this class.</p>}</div></>}
    <Button className="self-start" disabled={!selected.length || busy} loading={busy} onClick={async () => { setBusy(true); setError(null); setResult(null); try { const count = await importLessons({ group, sourceGroup: source, dayIds: selected }); setResult(`Imported ${count.imported} lessons. ${count.skipped} already imported.`); setSelected([]); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }}>Import {selected.length || "selected"} lessons</Button>
    {result && <p role="status" className="text-mint-i">{result}</p>}{error && <p role="alert" className="text-cor-i">{error}</p>}
  </section>;
}
