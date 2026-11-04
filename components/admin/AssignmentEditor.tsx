"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextInput, FieldError } from "@/components/ui/Field";
import { CodeView } from "@/components/ui/CodeView";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { partKindLabel, validatePartialRule, type PartKind } from "@/lib/evaluation";
import { errorMessage } from "@/lib/errors";
import { renderInlineMarkdown } from "@/lib/inlineMarkdown";
import { useGroup } from "./GroupContext";

import { useUnsavedWork } from "./UnsavedWork";

type Content = typeof api.adminAssignments.save._args.content;
type Loaded = NonNullable<typeof api.adminAssignments.get._returnType>;
type Revision = NonNullable<typeof api.adminAssignments.revision._returnType>;
const blank: Content = { title: "", type: "guided", summary: "", instructions: "", expectedOutput: "", starterFiles: [{ name: "main.py", content: "" }], parts: [], partialMin: 0, loopCheck: false, checkInput: "" };
const selectClass = "h-10 rounded-xl border border-bd bg-bg px-3 text-sm text-ink";
const areaClass = "min-h-24 w-full resize-y rounded-xl border border-bd bg-bg p-3 font-mono text-sm text-ink";
function fromRevision(revision: Revision | null, assignment?: Loaded["assignment"]): Content {
  return revision ? { title: revision.title ?? assignment?.title ?? "", type: revision.type ?? assignment?.type ?? "guided", summary: revision.summary, instructions: revision.instructions,
    expectedOutput: revision.expectedOutput ?? "", starterFiles: revision.starterFiles, parts: revision.parts, partialMin: revision.partialMin, loopCheck: revision.loopCheck, checkInput: revision.checkInput ?? "" } : { ...blank, title: assignment?.title ?? "", type: assignment?.type ?? "guided" };
}

export function AssignmentEditor() { return <Suspense fallback={<LoadingState label="Loading assignments…" />}><AssignmentRoute /></Suspense>; }
function AssignmentRoute() {
  const { group } = useGroup();
  const params = useParams<{ assignmentId?: string }>();
  const search = useSearchParams();
  const catalog = useQuery(api.adminAssignments.catalog, { group });
  const loaded = useQuery(api.adminAssignments.get, params.assignmentId ? { assignmentId: params.assignmentId as Id<"assignments"> } : "skip");
  if (catalog === undefined || (params.assignmentId && loaded === undefined)) return <LoadingState label="Loading assignments…" />;
  if (params.assignmentId && !loaded) return <EmptyState title="Assignment not found"><ButtonLink href="/admin/curriculum">Back to curriculum</ButtonLink></EmptyState>;
  const days = catalog.flatMap(c => c.days.map(d => ({ ...d, curriculumName: c.name })));
  const initialDay = days.find(d => d._id === search.get("dayId"))?._id ?? days[0]?._id;
  if (!loaded && !initialDay) return <EmptyState title="Add a lesson first"><p>Assignments belong to a lesson in the selected class.</p><ButtonLink href="/admin/curriculum" variant="primary">Open curriculum</ButtonLink></EmptyState>;
  return <EditorForm key={loaded?.assignment._id ?? `new:${group}:${initialDay}`} loaded={loaded ?? null} initialDay={initialDay} days={days} />;
}

function EditorForm({ loaded, initialDay, days }: { loaded: Loaded | null; initialDay?: Id<"days">; days: { _id: Id<"days">; order: number; topic: string; curriculumName: string; assignments: { _id: Id<"assignments">; title: string; status: "draft" | "published"; hasDraft: boolean }[] }[] }) {
  const router = useRouter();
  const save = useMutation(api.adminAssignments.save);
  const [content, setContent] = useState<Content>(() => fromRevision(loaded?.revision ?? null, loaded?.assignment));
  const [dayId, setDayId] = useState(loaded?.day._id ?? initialDay!);
  const [baseRevisionId, setBaseRevisionId] = useState(loaded?.revision?._id ?? null);
  const [baseline, setBaseline] = useState(JSON.stringify(content));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const dirty = JSON.stringify(content) !== baseline;
  useUnsavedWork(dirty, "assignment");
  const day = days.find(d => d._id === dayId);
  const label = loaded ? `Day ${loaded.day.order}: ${loaded.day.topic}` : day ? `Day ${day.order}: ${day.topic}` : "Lesson";
  const rule = validatePartialRule(content.parts.length, content.partialMin);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function set<K extends keyof Content>(key: K, value: Content[K]) { setContent(previous => ({ ...previous, [key]: value })); setMessage(""); }
  function leave(event: { preventDefault: () => void }) { if (dirty && !window.confirm("Discard unsaved assignment changes?")) event.preventDefault(); }
  async function persist(publish: boolean) {
    if (saving) return;
    setSaving(true); setError(null); setMessage("");
    try {
      const result = await save({ assignmentId: loaded?.assignment._id, dayId, baseRevisionId, publish, content });
      setBaseRevisionId(result.revisionId); setBaseline(JSON.stringify(content)); setMessage(publish ? "Published to students" : "Draft saved");
      if (!loaded) router.replace(`/admin/assignments/${result.assignmentId}`);
    } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
  }
  function updatePart(index: number, changes: Partial<Content["parts"][number]>) { set("parts", content.parts.map((part, i) => i === index ? { ...part, ...changes } : part)); }
  return <main className="flex flex-col gap-4 px-4 md:px-7 pt-4 pb-10">
    <Link href="/admin/curriculum" onNavigate={leave} className="self-start text-sm font-bold text-mint-i">← Back to curriculum</Link>
    <header className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><div className="text-sm text-ink3">Curriculum / {label} / Assignments</div><h1 className="m-0 text-4xl font-extrabold tracking-tight">{content.title || "New assignment"}</h1></div>
      <Pill tone={dirty ? "amber" : "mint"}>{dirty ? "Unsaved changes" : loaded?.assignment.status === "published" ? loaded.assignment.currentRevisionId !== loaded.assignment.publishedRevisionId ? "Published · newer draft" : "Published" : "Draft"}</Pill>
      <Button variant="secondary" size="lg" loading={saving} disabled={!dirty && !!loaded} onClick={() => void persist(false)}>Save draft</Button>
      <Button variant="primary" size="lg" loading={saving} loadingLabel="Saving…" onClick={() => void persist(true)}>Publish to lesson</Button>
    </header>
    <p className="m-0 text-sm text-ink3">Draft saves stay private. Publishing updates the task and checks for students; saved student files, submissions and past check results stay intact. New starter files apply only when a workspace is first opened.</p>
    {error && <FieldError id="assignment-save-error">{error}</FieldError>}{message && <p role="status" className="m-0 text-sm text-mint-i">{message}</p>}
    <div className="grid gap-5 xl:grid-cols-[210px_minmax(0,1fr)_minmax(300px,420px)]">
      <nav aria-label="Lesson assignments" className="flex flex-col gap-2 self-start rounded-2xl bg-sf p-3">
        <b className="text-sm">{label}</b>
        {(day?.assignments ?? []).map(a => <Link key={a._id} href={`/admin/assignments/${a._id}`} onNavigate={leave} aria-current={loaded?.assignment._id === a._id ? "page" : undefined} className="rounded-xl bg-bg p-2 text-sm text-ink no-underline"><b className="block">{a.title}</b><span className="text-xs text-ink3">{a.status}{a.hasDraft && a.status === "published" ? " · newer draft" : ""}</span></Link>)}
        <Link onNavigate={leave} href={`/admin/assignments?dayId=${dayId}`} className="text-sm font-bold">+ New assignment</Link>
        {loaded && <Button variant="secondary" onClick={() => setShowHistory(v => !v)}>Revision history</Button>}
      </nav>
      <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        {!loaded && <label className="flex flex-col gap-1 text-sm font-bold">Lesson<select className={selectClass} value={dayId} onChange={e => setDayId(e.target.value as Id<"days">)}>{days.map(d => <option key={d._id} value={d._id}>Day {d.order}: {d.topic}</option>)}</select></label>}
        <label className="flex flex-col gap-1 text-sm font-bold">Type<select className={selectClass} value={content.type} onChange={e => set("type", e.target.value as Content["type"])}><option value="guided">Guided</option><option value="open">Open-ended</option></select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">Title<TextInput maxLength={150} value={content.title} onChange={e => set("title", e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">Short summary<TextInput maxLength={1000} value={content.summary} onChange={e => set("summary", e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">Instructions<textarea className={areaClass} maxLength={50000} value={content.instructions} onChange={e => set("instructions", e.target.value)} /></label>
        <div className="rounded-xl bg-sf p-3"><b className="text-xs text-ink3">Students see</b><div className="whitespace-pre-wrap">{renderInlineMarkdown(content.instructions)}</div></div>
        {content.type === "guided" ? <>
          <label className="flex flex-col gap-1 text-sm font-bold">Expected output (shown beside the task)<textarea className={areaClass} maxLength={20000} value={content.expectedOutput} onChange={e => set("expectedOutput", e.target.value)} /></label>
          <StarterFiles files={content.starterFiles} onChange={files => set("starterFiles", files)} />
        </> : <p className="rounded-xl bg-sf p-3 text-sm">Open-ended projects start with a blank main.py and have no output checks.</p>}
      </fieldset>
      <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-3 self-start rounded-3xl border-0 bg-sf p-5">
        <h2 className="m-0 text-2xl font-bold">Evaluation</h2>
        {content.type === "open" ? <p className="text-sm">Admin feedback only; no guided checks required.</p> : <>
          <p className="m-0 text-xs text-ink3">Checks compare output, ignoring whitespace.</p>
          {content.parts.map((part, i) => <div key={i} className="flex flex-col gap-2 rounded-xl bg-bg p-3">
            <label className="flex flex-col gap-1 text-sm font-bold">Part {i + 1} name<TextInput maxLength={150} value={part.name} onChange={e => updatePart(i, { name: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-sm">Output rule<select className={selectClass} value={part.kind} onChange={e => updatePart(i, { kind: e.target.value as PartKind })}>{Object.entries(partKindLabel).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-sm">Expected text<textarea className={areaClass} maxLength={20000} value={part.expected} onChange={e => updatePart(i, { expected: e.target.value })} /></label>
            <Button size="sm" variant="ghost" onClick={() => set("parts", content.parts.filter((_, index) => i !== index))}>Remove part {i + 1}</Button>
          </div>)}
          <Button disabled={content.parts.length >= 32} onClick={() => set("parts", [...content.parts, { name: "", kind: "equals", expected: "" }])}>+ Add part</Button>
          <label className="flex flex-col gap-1 text-sm font-bold">Parts required for partial completion<TextInput type="number" min={0} max={32} step={1} value={content.partialMin} onChange={e => set("partialMin", Number(e.target.value))} /></label>
          <p role="status" className={`m-0 text-sm ${rule.ok ? "text-mint-i" : "text-cor-i"}`}>{rule.message}</p>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={content.loopCheck} onChange={e => set("loopCheck", e.target.checked)} />Stop infinite-loop checks after 1,000 rounds</label>
          <label className="flex flex-col gap-1 text-sm font-bold">Check input (one line per input() call)<textarea className={areaClass} maxLength={20000} value={content.checkInput} onChange={e => set("checkInput", e.target.value)} /></label>
        </>}
      </fieldset>
    </div>
    {showHistory && loaded && <RevisionHistory assignment={loaded.assignment} onRestore={revision => { if (dirty && !window.confirm("Replace your unsaved changes with this revision?")) return; setContent(fromRevision(revision, loaded.assignment)); setMessage("Revision loaded into the editor. Save draft to keep it; publish separately to update students."); }} />}
  </main>;
}

function StarterFiles({ files, onChange }: { files: Content["starterFiles"]; onChange: (files: Content["starterFiles"]) => void }) {
  const [error, setError] = useState("");
  async function upload(selected: FileList | null) {
    if (!selected) return;
    setError("");
    const added = [];
    for (const file of Array.from(selected)) {
      if (file.size > 100000 || !/\.(py|txt|csv|json)$/i.test(file.name)) { setError("Use .py, .txt, .csv or .json files up to 100 KB each."); return; }
      if ([...files, ...added].some(f => f.name.toLowerCase() === file.name.toLowerCase())) { setError("That file name already exists. Edit the existing file or rename it first."); return; }
      added.push({ name: file.name, content: await file.text() });
    }
    if (files.length + added.length > 20) { setError("Use at most 20 files."); return; }
    onChange([...files, ...added]);
  }
  return <section aria-label="Starter files" className="flex flex-col gap-3"><h2 className="m-0 text-xl font-bold">Starter files</h2><p className="m-0 text-xs text-ink3">Copied once into new student workspaces. Up to 20 files, 100 KB each, 400 KB total.</p>
    {files.map((file, i) => <div key={i} className="flex flex-col gap-2 rounded-xl bg-sf p-3">
      <label className="flex flex-col gap-1 text-sm font-bold">File {i + 1} name<TextInput value={file.name} onChange={e => onChange(files.map((f, index) => i === index ? { ...f, name: e.target.value } : f))} /></label>
      <label className="flex flex-col gap-1 text-sm">Contents<textarea spellCheck={false} className={`${areaClass} min-h-48`} value={file.content} onChange={e => onChange(files.map((f, index) => i === index ? { ...f, content: e.target.value } : f))} /></label>
      <Button disabled={files.length === 1} variant="ghost" size="sm" onClick={() => onChange(files.filter((_, index) => i !== index))}>Remove file</Button>
    </div>)}
    {error && <FieldError id="starter-upload-error">{error}</FieldError>}
    <div className="flex flex-wrap gap-3"><Button disabled={files.length >= 20} onClick={() => { let index = files.length; while (files.some(f => f.name === `file${index}.py`)) index++; onChange([...files, { name: `file${index}.py`, content: "" }]); }}>+ Add file</Button><label className="text-sm font-bold">Upload starter files<input type="file" multiple accept=".py,.txt,.csv,.json" onChange={e => { void upload(e.target.files); e.target.value = ""; }} /></label></div>
  </section>;
}

function RevisionHistory({ assignment, onRestore }: { assignment: Loaded["assignment"]; onRestore: (revision: Revision) => void }) {
  const { results, status, loadMore } = usePaginatedQuery(api.adminAssignments.revisions, { assignmentId: assignment._id }, { initialNumItems: 10 });
  const [selectedId, setSelectedId] = useState<Id<"assignmentRevisions"> | null>(null);
  const revision = useQuery(api.adminAssignments.revision, selectedId ? { revisionId: selectedId } : "skip");
  return <section aria-label="Revision history" className="flex flex-col gap-3 rounded-2xl bg-sf p-5"><h2 className="m-0 text-2xl font-bold">Revision history</h2>
    {status === "LoadingFirstPage" ? <LoadingState label="Loading revisions…" /> : <div className="flex flex-wrap gap-2">{results.map(r => <Button key={r._id} variant={r._id === selectedId ? "primary" : "secondary"} onClick={() => setSelectedId(r._id)}>{new Date(r.createdAt).toLocaleString()} · {r.author}{r.published ? " · Published" : ""}{r.current ? " · Latest draft" : ""}</Button>)}</div>}
    {status !== "Exhausted" && status !== "LoadingFirstPage" && <Button loading={status === "LoadingMore"} onClick={() => loadMore(10)}>Older revisions</Button>}
    {selectedId && revision === undefined && <LoadingState label="Loading revision…" />}
    {revision && <div className="flex min-w-0 flex-col gap-3"><h3 className="m-0 text-xl">{revision.title ?? assignment.title} · {revision.type ?? assignment.type}</h3><p className="m-0 text-sm">{revision.summary}</p><div className="whitespace-pre-wrap">{renderInlineMarkdown(revision.instructions)}</div>
      {revision.expectedOutput && <pre className="overflow-auto rounded-xl bg-bg p-3">{revision.expectedOutput}</pre>}
      <ul>{revision.parts.map((p, i) => <li key={i}>{p.name} · {partKindLabel[p.kind]} · <code>{p.expected}</code></li>)}</ul>
      <p className="m-0 text-sm">Partial: {revision.partialMin} parts · Loop check: {revision.loopCheck ? "on" : "off"}</p>
      {revision.checkInput && <pre className="overflow-auto rounded-xl bg-bg p-3">Check input: {revision.checkInput}</pre>}
      {revision.starterFiles.map(f => <div key={f.name}><b>{f.name}</b><CodeView code={f.content} className="max-h-64 rounded-xl" /></div>)}
      <Button variant="secondary" onClick={() => onRestore(revision)}>Load revision as draft</Button>
    </div>}
  </section>;
}
