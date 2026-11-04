"use client";

import { useConvex, useMutation } from "convex/react";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/errors";
import { parseRosterCsv } from "@/lib/rosterCsv";
import type { CurriculumOption } from "./StudentDrawer";
import { useGroup, type Group } from "./GroupContext";

type Row = { firstName: string; lastName: string; loginCode: string; mode: "new" | "returning" };
export function RosterImport({ group, curricula, onClose }: { group: Group; curricula: CurriculumOption[]; onClose: () => void }) {
  const { selectedClass } = useGroup();
  const convex = useConvex();
  const commit = useMutation(api.rosterImport.commit);
  const [csv, setCsv] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState({ firstName: "", lastName: "", loginCode: "" });
  const curriculumId = curricula.filter(c => c.group === group).at(-1)?._id;
  const [newRows, setNewRows] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<{ result: FunctionReturnType<typeof api.rosterImport.preview>; rows: Row[]; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const rows: Row[] = csv?.slice(1).map((row, index) => ({ firstName: row[Number(mapping.firstName)] ?? "", lastName: row[Number(mapping.lastName)] ?? "", loginCode: mapping.loginCode === "" ? "" : row[Number(mapping.loginCode)] ?? "", mode: newRows.has(index) ? "new" : "returning" })) ?? [];
  const canPreview = rows.length > 0 && mapping.firstName !== "" && mapping.lastName !== "" && new Set(Object.values(mapping).filter(Boolean)).size === Object.values(mapping).filter(Boolean).length && curriculumId;
  async function review() {
    if (!canPreview) return;
    setBusy(true); setError(null);
    try {
      const result = await convex.query(api.rosterImport.preview, { group, curriculumId: curriculumId as CurriculumOption["_id"], rows });
      setPreview({ result, rows, key: crypto.randomUUID() });
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview || !curriculumId) return;
    setBusy(true); setError(null);
    try {
      const ids = await commit({ group, curriculumId: curriculumId as CurriculumOption["_id"], rows: preview.rows, fingerprint: preview.result.fingerprint, key: preview.key });
      setDone(ids.length);
    } catch (err) { setError(errorMessage(err, "Import failed. Retry with the same preview, or go back to review a fresh preview.")); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="roster-import-title" className="mx-7 my-4 rounded-2xl border border-bd bg-sf p-5">
    <div className="flex items-center gap-3"><h2 id="roster-import-title" className="mr-auto text-xl font-bold">Import roster · {selectedClass?.name ?? group}</h2></div>
    {done !== null ? <p role="status" className="mt-4">✓ Imported {done} students. Saved identities, login codes and work are preserved. See History for changes, or Print tickets above.</p> : <>
      <p className="my-3 text-sm text-ink3">Upload a CSV export with a header row (up to 100 students, 1 MB).</p>
      {!preview ? <>
        <label className="mb-3 block text-sm font-bold">CSV file <input className="ml-3" type="file" accept=".csv,text/csv" disabled={busy} onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return;
          setError(null); setCsv(null); setNewRows(new Set());
          try {
            if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Export your spreadsheet as a .csv file first.");
            if (file.size > 1_000_000) throw new Error("CSV files must be at most 1 MB.");
            const parsed = parseRosterCsv(await file.text()); setCsv(parsed); setMapping({ firstName: "", lastName: "", loginCode: "" });
          } catch (err) { setError(errorMessage(err)); }
        }} /></label>
        <div className="my-3 flex flex-wrap gap-4">

          {csv && (Object.keys(mapping) as (keyof typeof mapping)[]).map(field => <label key={field} className="text-sm font-bold">{field === "firstName" ? "First name" : field === "lastName" ? "Last name" : "Existing login code (optional)"}<select className="ml-2 rounded-lg border border-bd bg-bg p-2" value={mapping[field]} onChange={e => setMapping({ ...mapping, [field]: e.target.value })}><option value="">{field === "loginCode" ? "No column" : "Choose column"}</option>{csv[0].map((header, i) => <option key={i} value={i}>{i + 1}: {header || "(blank header)"}</option>)}</select></label>)}
        </div>
        {csv && <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Row</th><th>Name</th><th>Existing code</th><th>Create separate new identity</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-t border-ln"><td className="p-2">{i + 2}</td><td>{row.firstName} {row.lastName}</td><td className="font-mono">{row.loginCode || "—"}</td><td><label><input type="checkbox" checked={newRows.has(i)} onChange={e => { const next = new Set(newRows); if (e.target.checked) next.add(i); else next.delete(i); setNewRows(next); }} /> New student <span className="sr-only">row {i + 2}</span></label></td></tr>)}</tbody></table></div>}
        <Button className="mt-4" variant="primary" disabled={!canPreview} loading={busy} onClick={() => void review()}>Preview import</Button>
      </> : <>
        <p className="my-3 font-bold">Class: {selectedClass?.name ?? group} · {selectedClass?.year}</p>
        <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Row / action</th><th>Student / login code</th><th>Preview</th></tr></thead><tbody>{preview.result.rows.map((row, i) => <tr key={i} className="border-t border-ln"><td className="p-2">{i + 2} · {row.studentId ? "Update existing" : "Create new"}</td><td>{row.firstName} {row.lastName}<div className="font-mono">{row.loginCode}</div></td><td className="p-2">{row.error ? <span className="text-cor-i">{row.error}</span> : row.warning ?? "New identity and unique login code."}</td></tr>)}</tbody></table></div>
        <p className="my-3 text-sm">All rows are saved together. Returning students keep their login codes, original year, work and submissions. Students absent from this file are unchanged.</p>
        <div className="flex gap-3"><Button variant="primary" loading={busy} disabled={!preview.result.valid} onClick={() => void save()}>Import {preview.rows.length} students</Button><Button disabled={busy} onClick={() => { setPreview(null); setError(null); }}>Back to mapping</Button></div>
      </>}
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-cor-i">{error}</p>}
    <Button variant="danger" className="mt-4" disabled={busy} onClick={onClose}>Close</Button>
  </section>;
}
