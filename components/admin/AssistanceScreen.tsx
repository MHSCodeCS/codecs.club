"use client";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/States";
import { CodeEditor, type CodeEditorHandle } from "@/components/workspace/CodeEditor";
import { ConnectionWatcher, useWorkspaceSync } from "@/components/workspace/useWorkspaceSync";
import { useAssistancePresence, peerCursors } from "@/components/workspace/useAssistancePresence";
import { SharedRun, type AssistanceDetail } from "@/components/workspace/AssistanceInfo";
import { SaveStatusPill } from "@/components/workspace/SaveStatusPill";
import { OutputPanel } from "@/components/workspace/OutputPanel";
import { usePythonRuntime } from "@/components/workspace/usePythonRuntime";
import { errorMessage } from "@/lib/errors";
import { chooseEntry } from "@/lib/python/runner";
import { useNow } from "@/lib/useNow";
import { PhoneSheet } from "@/components/ui/PhoneSheet";
import { useGroup } from "./GroupContext";

export function AssistanceScreen() {
  const { group, selectedClass } = useGroup();
  const classroom = useQuery(api.assistance.classroom, { group });
  const search = useSearchParams();
  const linked = search.get("workspace");
  const [choice, setChoice] = useState<{ linked: string | null; id: Id<"workspaces"> | null } | null>(null);
  const selected = choice?.linked === linked ? choice.id : linked as Id<"workspaces"> | null;
  const [unworkedSelection, setUnworkedSelection] = useState<{ id: Id<"students">; group: string } | null>(null);
  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Element && !event.target.closest("[data-assistance-sidebar]") && !event.target.closest("[aria-label='Class list']")) {
        setChoice({ linked, id: null });
        setUnworkedSelection(null);
      }
    };
    document.addEventListener("click", closeOutside, true);
    return () => document.removeEventListener("click", closeOutside, true);
  }, [linked]);
  const now = useNow();
  const detail = useQuery(api.assistance.detail, selected ? { workspaceId: selected } : "skip");
  const [error, setError] = useState<string | null>(null);
  if (!classroom) return <LoadingState label="Loading classroom…" />;
  const online = new Set(classroom.online.filter(p => p.online).map(p => p.userId));
  const focused = new Set(classroom.focused.map(p => p.userId));
  const active = new Set(classroom.active.map(p => p.userId));
  const status = (userId: string) => !online.has(userId) ? "Offline" : !focused.has(userId) ? "Away" : active.has(userId) ? "Online" : "Idle";
  const pick = (id: Id<"workspaces"> | null) => { setChoice({ linked, id }); setUnworkedSelection(null); setError(null); };
  const counts = { Online: 0, Idle: 0, Away: 0, Offline: 0 };
  classroom.students.forEach(p => counts[status(p.student.userId)]++);
  const unworked = unworkedSelection?.group === group ? classroom.students.find(p => p.student._id === unworkedSelection.id) : undefined;
  const needingHelp = new Set(classroom.help.map(request => request.studentId)).size;
  return <main className="flex flex-col gap-4 px-5 pt-4 pb-5">
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="m-0 text-[46px] leading-[1.04] font-extrabold tracking-[-.035em]">Classroom</h1>
      <span className="inline-flex self-center items-center rounded-full bg-mint px-3 py-1 text-xs leading-none font-bold text-on-mint">● Live · {selectedClass?.name ?? group} · {classroom.year}</span>

    </div>
    <div className={`grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]`}>
      <div className="flex min-w-0 flex-col gap-3">
        <section aria-label="Class list" className="overflow-hidden rounded-2xl bg-sf">
          <h2 className="p-4 text-xl font-bold">Students</h2>
          {classroom.students.map(person => <button key={person.student._id} type="button" onClick={() => { pick(person.workspaceId); if (!person.workspaceId) setUnworkedSelection({ id: person.student._id, group }); }} className="flex min-h-16 w-full flex-wrap items-center gap-3 border-0 border-t border-ln bg-transparent p-4 text-left text-ink hover:bg-mint-s">
            <span className="min-w-0 flex-1"><b className="block">{person.student.firstName} {person.student.lastName}</b><span className="text-xs text-ink3">{person.task ?? "No saved work yet"}</span></span>
            <span className="text-xs font-semibold">{status(person.student.userId)}</span>
          </button>)}
        </section>
      </div>
      {<div data-assistance-sidebar className="flex min-w-0 flex-col gap-4">
        {selected || unworked ? <PhoneSheet open onClose={() => pick(null)} title="Student work" backLabel="Classroom"><div className="flex min-h-[calc(100dvh-160px)] flex-col gap-3 rounded-[22px] bg-sf p-4"><Button size="sm" variant="ghost" className="self-start" onClick={() => pick(null)}>← Back to help queue</Button>{selected ? detail ? <AssistanceEditor key={selected} data={detail} onPick={pick} /> : <LoadingState label="Opening saved work…" /> : unworked && <div className="p-2"><h2 className="text-2xl font-extrabold">{unworked.student.firstName} {unworked.student.lastName}</h2><p className="mt-1 font-mono text-xs text-ink3">{unworked.student.loginCode}</p><p className="mt-4 text-sm text-ink3">No saved work yet. Their workspace will be available here once they start an assignment.</p></div>}</div></PhoneSheet> : <>
        <aside aria-label="Help queue" className="flex min-h-[calc(100dvh-160px)] flex-col gap-4 rounded-[22px] bg-sf p-5">
    <div className="grid grid-cols-2 gap-3" aria-label="Classroom overview">
      <section className="flex flex-col gap-1 rounded-2xl bg-mint-s px-4 py-4 text-mint-i">
        <h2 className="text-sm font-bold">Students active</h2>
        <p className="text-[36px] leading-tight font-extrabold tabular-nums">{counts.Online}</p>
        <p className="text-xs">{counts.Idle} idle · {counts.Away} away · {counts.Offline} offline</p>
      </section>
      <section className="flex flex-col gap-1 rounded-2xl bg-amb-s px-4 py-4 text-amb-i">
        <h2 className="text-sm font-bold">Students needing help</h2>
        <p className="text-[36px] leading-tight font-extrabold tabular-nums">{needingHelp}</p>
        <p className="text-xs">{classroom.help.length} open {classroom.help.length === 1 ? "request" : "requests"}</p>
      </section>
    </div>

          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight">Help queue</h2>
            <span className="ml-auto rounded-full bg-amb-s px-2.5 py-1 text-xs font-bold text-amb-i">{needingHelp} waiting</span>
          </div>
          {classroom.help.length ? <ol className="flex max-h-[calc(100dvh-420px)] flex-col gap-2 overflow-y-auto">{classroom.help.map((request, i) => <li key={request.id}>
            <button type="button" aria-pressed={selected === request.workspaceId} onClick={() => pick(request.workspaceId)} className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${selected === request.workspaceId ? "border-mint-i bg-mint-s2" : "border-transparent bg-amb-s hover:border-amb"}`}>
              <span className="grid size-7 flex-none place-items-center rounded-lg bg-amb text-xs font-extrabold text-on-amb">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1"><b className="text-sm">{request.name}</b><span className="text-xs text-ink2">{request.task}</span><span className="text-[11px] text-ink3">Waiting {Math.max(0, Math.floor((now - request.createdAt) / 60000))} min</span></span>
              <span aria-hidden="true" className="text-ink3">→</span>
            </button>
          </li>)}</ol> : <div className="flex flex-1 flex-col justify-center rounded-xl bg-bg px-4 py-8 text-center"><p className="font-bold text-mint-i">Everyone’s caught up</p><p className="mt-1 text-sm text-ink3">No students are waiting for help.</p></div>}
        </aside>
        </>}
      </div>}

    </div>
    {error && <p role="alert" className="text-cor-i">{error}</p>}
  </main>;

}

function AssistanceEditor({ data, onPick }: { data: AssistanceDetail; onPick: (id: Id<"workspaces">) => void }) {
  const convex = useConvex();
  const { sync, snapshot } = useWorkspaceSync({ ...data.workspace, files: data.files });
  const presence = useAssistancePresence(data.workspace._id, sync, data.joined);
  const { runtime, py } = usePythonRuntime(`assistance:${data.workspace._id}`);
  const join = useMutation(api.assistance.join), leave = useMutation(api.assistance.leave), resolve = useMutation(api.assistance.resolveHelp), addNote = useMutation(api.assistance.addNote);
  const [file, setFile] = useState(data.files[0]?.name ?? "main.py");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownRun, setOwnRun] = useState<Id<"remoteRuns"> | null>(null);
  const retryKey = useRef<string | null>(null);
  const editor = useRef<CodeEditorHandle>(null);
  const shown = snapshot.files.some(f => f.name === file) ? file : snapshot.files[0]?.name ?? "main.py";
  useEffect(() => { editor.current?.applyRemote(sync.applyServer(data.files, data.workspace.updatedAt)); }, [sync, data.files, data.workspace.updatedAt]);
  useEffect(() => {
    if (!ownRun) return;
    let inFlight = false, canceled = false;
    const publish = async () => {
      if (inFlight || canceled) return;
      const state = runtime.getSnapshot();
      const running = ["running", "stopping", "installing"].includes(state.status.kind);
      const output = state.output.map(segment => segment.text).join("");
      const status = running ? "running" : state.lastRun?.outcome === "error" ? "error" : state.lastRun?.outcome === "stopped" ? "stopped" : "finished";
      inFlight = true;
      try { await convex.mutation(api.remoteRuns.publish, { id: ownRun, output: output.slice(-100_000), outputTruncated: output.length > 100_000 || state.outputTrimmed || state.outputDropped, status }); if (!running && !canceled) setOwnRun(null); }
      catch (err) { if (!canceled) setError(errorMessage(err)); }
      finally { inFlight = false; }
    };
    const timer = setInterval(() => { void publish(); }, 500);
    void publish();
    return () => { canceled = true; clearInterval(timer); runtime.stop(); void convex.mutation(api.remoteRuns.publish, { id: ownRun, output: runtime.getSnapshot().output.map(s => s.text).join("").slice(-100_000), outputTruncated: runtime.getSnapshot().outputTrimmed, status: "stopped" }).catch(() => {}); };
  }, [ownRun, convex, runtime]);
  useEffect(() => { if (ownRun && (data.remote?.run.stopRequested || !data.joined || data.remote?.run.status === "interrupted")) runtime.stop(); }, [data.remote, data.joined, ownRun, runtime]);
  async function act(task: () => Promise<unknown>) { setBusy(true); setError(null); try { await task(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }
  async function run() {
    if (runtime.getSnapshot().status.kind !== "ready") throw new Error("Python is busy or still loading. Try again when ready.");
    await sync.flush();
    const entry = chooseEntry(snapshot.files.map(f => f.name), shown, "main.py");
    if (!entry) throw new Error("Choose a Python file to run.");
    retryKey.current ??= crypto.randomUUID();
    const result = await convex.mutation(api.remoteRuns.start, { workspaceId: data.workspace._id, entry, key: retryKey.current });
    retryKey.current = null;
    if (result.run.status !== "running") return;
    if (runtime.getSnapshot().status.kind !== "ready") { await convex.mutation(api.remoteRuns.publish, { id: result.run._id, output: "Python became busy before execution.", outputTruncated: false, status: "stopped" }); return; }
    runtime.run(result.files, result.run.entry, result.run.packages);
    setOwnRun(result.run._id);
  }
  return <aside aria-label="Selected student's live work" className="flex min-w-0 flex-col gap-3 rounded-[22px] bg-sf p-4">
    <ConnectionWatcher sync={sync} />
    <div><p className="mb-1 text-xs text-ink3">{data.workspace.group} · {data.topic} · {data.task}</p><h2 className="text-2xl font-extrabold tracking-tight">{data.student.firstName} {data.student.lastName}</h2><span className="font-mono text-xs text-ink3">{data.student.loginCode}</span><p className="text-xs text-ink3">{data.cursors.some(c => c.role === "student") ? "● Online in this workspace" : "○ Offline · saved work available"}</p></div>
    <details className="text-xs text-ink3"><summary className="cursor-pointer">Saved work · {data.workspace.year} · {data.curriculumName}</summary><label className="mt-2 block text-sm font-bold">Saved work <select className="ml-2 max-w-full rounded-lg border border-bd bg-bg p-2" value={data.workspace._id} disabled={busy} onChange={e => { const id = e.target.value as Id<"workspaces">; void act(async () => { await sync.flush(); await leave({ workspaceId: data.workspace._id }); onPick(id); }); }}>{data.works.map(work => <option key={work.id} value={work.id}>{work.title} · {work.year} · {work.group}</option>)}</select></label></details>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={data.joined ? "secondary" : "primary"} loading={busy} onClick={() => void act(async () => { if (data.joined) { await sync.flush(); runtime.stop(); await leave({ workspaceId: data.workspace._id }); } else { await join({ workspaceId: data.workspace._id }); await sync.flush(); } })}>{data.joined ? "Leave" : "Join"}</Button>
      {data.helpId && <Button onClick={() => void act(() => resolve({ id: data.helpId! }))} disabled={busy}>Resolve help</Button>}
      <SaveStatusPill status={snapshot.status} timeZone={data.timeZone} onRetry={() => void act(() => sync.flush())} />
      <Link href="/admin/review" className="ml-auto text-xs font-bold">Review submissions →</Link>
    </div>
    <p className="text-xs text-ink3">{data.joined ? "Joined · Edits are shared and your cursor is labeled. Leaving preserves the work." : "Saved copy · Join to edit or run. The student receives a notification."} {presence.connected ? "Connected" : "Offline · changes kept locally"}</p>
    <div className="scheme-dark flex min-h-[300px] flex-col overflow-hidden rounded-xl bg-code-bg text-code-ink"><div className="flex flex-wrap gap-1 bg-code-bar p-2">{snapshot.files.map(f => <Button key={f.name} variant={f.name === shown ? "primary" : "secondary"} size="sm" onClick={() => setFile(f.name)}>{f.name}</Button>)}</div><div className="min-h-[240px] flex-1"><CodeEditor ref={editor} fileName={shown} readContent={name => sync.content(name)} onChange={(name, content) => sync.edit(name, content)} readOnly={!data.joined || busy} sharedText={name => sync.sharedText(name)} onCursor={presence.onCursor} remoteCursors={peerCursors(data.cursors, presence.identity, shown, sync)} /></div></div>
    <div className="flex flex-wrap items-center gap-2"><Button variant="primary" disabled={!data.joined || py.status.kind !== "ready" || data.remote?.run.status === "running"} loading={busy} onClick={() => void act(run)}>▶ Run</Button><span className="text-xs text-ink3">Python: {py.status.kind} · Executes here, including when the student is offline</span>{py.status.kind === "unavailable" && <Button onClick={() => runtime.restart()}>Retry Python</Button>}</div>
    {ownRun && <div className="scheme-dark h-60 overflow-hidden rounded-xl bg-code-bar text-code-ink"><OutputPanel runtime={runtime} py={py} /></div>}
    <SharedRun remote={data.remote} />
    <details className="rounded-xl bg-bg p-3"><summary className="cursor-pointer text-sm font-bold">+ Add a written note <span className="ml-1 text-xs font-normal text-ink3">Optional</span></summary><label className="mt-3 block text-sm font-bold">Student-visible guidance<textarea disabled={busy} className="mt-1 w-full rounded-xl border border-bd bg-bg p-3 font-normal" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} placeholder="Write a short note…" /></label><Button className="self-start" disabled={!note.trim() || busy} onClick={() => void act(async () => { await addNote({ workspaceId: data.workspace._id, body: note }); setNote(""); })}>Save guidance note</Button></details>
    {data.notes.map(n => <p key={n.id} className="rounded-lg bg-vio-s p-2 text-sm whitespace-pre-wrap text-vio-i"><b>{n.name}:</b> {n.body}</p>)}
    {(error || presence.failure) && <p role="alert" className="text-sm text-cor-i">{error ?? presence.failure}</p>}
  </aside>;
}
