"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/errors";
import { useGroup } from "./GroupContext";
export function FindStudent({ onClose }: { onClose: () => void }) {
  const { group, selectedClass } = useGroup();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [added, setAdded] = useState<string | null>(null);
  const people = useQuery(api.classes.findStudents, { search, group });
  const enroll = useMutation(api.classes.enroll);
  return <section aria-label="Find returning student" className="mx-7 mt-4 flex flex-col gap-3 rounded-2xl bg-sf p-5">
    <div className="flex items-center gap-3"><h2 className="mr-auto text-2xl font-bold">Find returning student</h2></div>

    <label className="flex flex-col gap-1 text-sm font-bold">Student name or login code<input autoFocus maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setError(null); setAdded(null); }} placeholder="Type at least two characters" className="h-11 max-w-lg rounded-xl border border-bd bg-bg px-3" /></label>
    {search.trim().length >= 2 && people === undefined && <p role="status">Searching…</p>}
    <div className="max-h-96 overflow-auto">{people?.map(person => <div key={person._id} className="flex flex-wrap items-center gap-3 border-b border-ln py-3"><div className="flex-1"><b>{person.firstName} {person.lastName}</b><p className="text-sm text-ink3">{person.previousClass} · Student since {person.sinceYear}{person.removed ? " · Removed" : ""}</p><p className="font-mono text-xs">{person.loginCode}</p></div><Button disabled={!!busy || person.enrolled} loading={busy === person._id} onClick={async () => { setBusy(person._id); setError(null); setAdded(null); try { await enroll({ studentId: person._id, group, restore: person.removed }); setAdded(`${person.firstName} ${person.lastName} added to ${selectedClass?.name}.`); } catch (err) { setError(errorMessage(err)); } finally { setBusy(null); } }}>{person.enrolled ? "Already enrolled" : person.removed ? "Restore and add" : "Add to class"}</Button></div>)}</div>
    {search.trim().length >= 2 && people?.length === 0 && <p>No students found. Try a first name, last name, or exact login code.</p>}
    {people?.length === 50 && <p className="text-sm text-ink3">Showing 50 matches. Refine your search to find a specific student.</p>}
    {added && <p role="status" className="text-mint-i">{added}</p>}{error && <p role="alert" className="text-cor-i">{error}</p>}
    <Button variant="danger" className="self-start" disabled={!!busy} onClick={onClose}>Close</Button>
  </section>;
}
