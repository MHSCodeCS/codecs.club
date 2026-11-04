"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CodeView } from "@/components/ui/CodeView";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { formatWeekdayDateTime, formatYear } from "@/lib/format";

type Work = typeof api.myWork.list._returnType.page[number];

/** Saved personal work, with its original year/group/curriculum context. */
export function MyWork() {
  const { results, status, loadMore } = usePaginatedQuery(api.myWork.list, {}, { initialNumItems: 20 });
  const [selectedId, setSelectedId] = useState<Id<"workspaces"> | null>(null);
  const selected = results.find(w => w._id === selectedId) ?? results[0];
  const groups = new Map<string, Work[]>();
  for (const work of results) {
    const key = `${work.year}:${work.group}:${work.curriculumId}`;
    const group = groups.get(key) ?? []; group.push(work); groups.set(key, group);
  }
  return <main className="flex flex-col pb-10">
    <h1 className="mx-6 mt-4 mb-0 text-[clamp(40px,4.3vw,58px)] font-extrabold tracking-[-.035em] lg:mx-10">My work</h1>
    <p className="mx-6 mt-2 text-sm text-ink3 lg:mx-10">Your saved work across every year and curriculum. Past work stays available to open and edit.</p>
    {status === "LoadingFirstPage" ? <LoadingState label="Loading your work…" /> : results.length === 0 ? <EmptyState title="No saved work yet" className="mx-6"><p>Open an assignment from Learning home to get started.</p><ButtonLink href="/learn" variant="primary">Learning home</ButtonLink></EmptyState> : <div className="grid gap-6 px-6 pt-2 lg:grid-cols-[minmax(0,1fr)_452px] lg:px-10">
      <section aria-label="Work list" className="flex min-w-0 flex-col gap-5">
        {[...groups.entries()].map(([key, items]) => <section key={key}>
          <div className="mb-2 flex flex-wrap items-center gap-2 px-3.5"><h2 className="m-0 text-[15px] font-bold">{formatYear(items[0].year)} · {items[0].group} · {items[0].curriculumName}</h2>{items[0].current ? <Pill>Current</Pill> : <span className="text-xs text-ink3">Previous curriculum / year</span>}</div>
          {items.map(item => <div key={item._id} className={cn("flex flex-wrap items-center gap-3 rounded-2xl p-3.5", selected?._id === item._id ? "bg-mint-s" : "hover:bg-sf")}>
            <button type="button" aria-pressed={selected?._id === item._id} onClick={() => setSelectedId(item._id)} className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-ink"><b>{item.title}</b><span className="block text-[13px] text-ink3">Day {item.dayOrder} · {item.topic} · {item.type === "guided" ? "guided" : "open-ended"}</span><span className="block text-xs text-ink3">Saved {formatWeekdayDateTime(item.updatedAt, item.timeZone)}</span></button>
            <Pill tone={item.latestAttempt?.reviewDecision === "needsWork" ? "coral" : item.latestAttempt?.reviewDecision === "complete" ? "mint" : item.latestAttempt?.status === "reviewed" ? "violet" : item.latestAttempt ? "mint" : "amber"}>{item.latestAttempt?.reviewDecision === "needsWork" ? "Needs Work" : item.latestAttempt?.reviewDecision === "complete" ? "Done" : item.latestAttempt?.status === "reviewed" ? "Reviewed" : item.latestAttempt ? "Turned in · awaiting review" : "In progress · not turned in"}</Pill>
            <ButtonLink href={`/learn/assignments/${item.assignmentId}`} variant={item.latestAttempt ? "secondary" : "primary"}>{item.latestAttempt ? "Open work" : "Resume"}</ButtonLink>
          </div>)}
        </section>)}
        {status !== "Exhausted" && <Button loading={status === "LoadingMore"} loadingLabel="Loading…" onClick={() => loadMore(20)}>Load more work</Button>}
      </section>
      {selected && <WorkDetail key={selected._id} item={selected} />}
    </div>}
  </main>;
}

function WorkDetail({ item }: { item: Work }) {
  const { results, status, loadMore } = usePaginatedQuery(api.myWork.attempts, { workspaceId: item._id }, { initialNumItems: 10 });
  const [submissionId, setSubmissionId] = useState<Id<"submissions"> | null>(null);
  const selected = results.find(a => a._id === submissionId);
  return <aside aria-label="Selected work" className="flex min-w-0 flex-col gap-4 self-start rounded-3xl bg-sf p-6">
    <div className="text-sm text-ink3">{formatYear(item.year)} · {item.group} · {item.curriculumName}<br />Day {item.dayOrder}: {item.topic}</div>
    <h2 className="m-0 text-3xl font-extrabold">{item.title}</h2>
    <ButtonLink variant="primary" href={`/learn/assignments/${item.assignmentId}`}>Open working copy</ButtonLink>
    <h3 className="m-0 text-lg font-bold">Submission history</h3>
    {status === "LoadingFirstPage" ? <LoadingState label="Loading attempts…" /> : results.length === 0 ? <p className="m-0 text-sm text-ink3">Not turned in yet. Your working copy is saved.</p> : <ol className="m-0 flex list-none flex-col gap-4 p-0">{results.map(a => <li key={a._id} className="rounded-2xl bg-bg p-4">
      {a.reviewDecision && <Pill tone={a.reviewDecision === "needsWork" ? "coral" : "mint"}>{a.reviewDecision === "needsWork" ? "Needs Work" : "Done"}</Pill>}
      <b>Attempt {a.attempt} · version {a.version}</b><div className="text-xs text-ink3">Turned in {formatWeekdayDateTime(a.submittedAt, item.timeZone)}</div>
      <p className="my-2 text-sm">{a.status === "reviewed" ? `Reviewed by ${a.reviewer ?? "an admin"}${a.reviewedAt ? ` · ${formatWeekdayDateTime(a.reviewedAt, item.timeZone)}` : ""}` : a.status === "superseded" ? "Superseded by a newer attempt" : "Waiting for review"}<br />Check: {a.outcome === "complete" ? "Completion" : a.outcome === "partial" ? "Partial completion" : a.outcome === "none" ? "No completion" : "Not checked"}</p>
      {a.feedback.map((note, i) => <blockquote key={i} className="mx-0 rounded-xl bg-vio-s p-3 text-sm"><b className="block">Note from {note.author}</b><span className="whitespace-pre-wrap">{note.body}</span></blockquote>)}
      <Button size="sm" aria-pressed={submissionId === a._id} onClick={() => setSubmissionId(submissionId === a._id ? null : a._id)}>View attempt {a.attempt}</Button>
    </li>)}</ol>}
    {status !== "Exhausted" && status !== "LoadingFirstPage" && <Button loading={status === "LoadingMore"} onClick={() => loadMore(10)}>Older attempts</Button>}
    {selected && <SubmittedSnapshot key={selected._id} submissionId={selected._id} attempt={selected.attempt} />}
  </aside>;
}

function SubmittedSnapshot({ submissionId, attempt }: { submissionId: Id<"submissions">; attempt: number }) {
  const files = useQuery(api.myWork.submittedFiles, { submissionId });
  const [fileName, setFileName] = useState<string | null>(null);
  if (files === undefined) return <LoadingState label="Loading submitted version…" />;
  if (!files) return <p role="alert">This submitted version is unavailable.</p>;
  const selected = files.find(f => f.name === fileName) ?? files[0];
  return <section aria-label={`Attempt ${attempt} submitted snapshot`} className="min-w-0 overflow-hidden rounded-xl border border-bd">
    <h3 className="m-0 p-3 text-sm font-bold">Attempt {attempt} · submitted snapshot · read-only</h3>
    <div className="flex flex-wrap gap-1 px-3 pb-3">{files.map(f => <Button key={f.name} size="sm" variant={selected?.name === f.name ? "primary" : "secondary"} aria-pressed={selected?.name === f.name} onClick={() => setFileName(f.name)}>{f.name}</Button>)}</div>
    {selected && (selected.name.endsWith(".py") ? <CodeView code={selected.content} label={`Submitted ${selected.name}`} className="max-h-96" /> : <pre className="m-0 max-h-96 overflow-auto p-3 text-sm">{selected.content}</pre>)}
  </section>;
}
