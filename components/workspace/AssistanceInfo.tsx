"use client";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/errors";
export type AssistanceDetail = FunctionReturnType<typeof api.assistance.detail>;

export function AssistanceInfo({ data }: { data: AssistanceDetail | undefined }) {
  if (!data) return null;
  return <div className="mx-3 mb-2 flex max-h-40 flex-wrap gap-3 overflow-auto rounded-xl bg-vio-s px-4 py-2 text-sm text-vio-i" aria-live="polite">
    <div className="min-w-48 flex-1"><b>Live assistance</b>
      {data.events.length ? <ul className="mt-1 space-y-1">{data.events.slice(0, 3).map(event => <li key={event._id}>{event.name} {event.kind === "joined" ? "joined your work" : "left your work"} · {new Date(event.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</li>)}</ul> : <p>No one has joined yet. Ask for help when you need it.</p>}
      <p className="mt-1 text-xs">{data.cursors.filter(p => p.role === "teacher").map(p => p.name).join(", ") || "No one connected right now"}</p>
    </div>
    {data.notes.length > 0 && <div className="min-w-48 flex-1"><b>Guidance</b>{data.notes.slice(0, 5).map(note => <p key={note.id} className="mt-1 whitespace-pre-wrap"><b>{note.name}:</b> {note.body}</p>)}</div>}
  </div>;
}
export function SharedRun({ remote }: { remote: AssistanceDetail["remote"] }) {
  const stop = useMutation(api.remoteRuns.stop);
  const [error, setError] = useState<string | null>(null);
  if (!remote) return null;
  const { run, version, stale } = remote;
  return <section aria-label="Shared run output" className="rounded-xl bg-vio-s p-3 text-sm text-vio-i">
    <div className="flex flex-wrap items-center gap-2"><b>Run by {run.actorName} · v{version} · {run.entry}</b><span>{run.status}</span>{run.status === "running" && <Button size="sm" disabled={run.stopRequested} onClick={() => { void stop({ id: run._id }).catch(err => setError(errorMessage(err))); }}>{run.stopRequested ? "Stopping…" : "Stop run"}</Button>}</div>
    <p className="text-xs">Executed in the admin’s browser · {new Date(run.startedAt).toLocaleString()}{stale ? " · Code changed since this run" : ""}</p>
    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-code-bg p-3 font-mono text-xs whitespace-pre-wrap text-code-ink">{run.output || (run.status === "running" ? "Waiting for output…" : "No output.")}</pre>
    {run.outputTruncated && <p className="text-xs">Earlier output was trimmed.</p>}{run.status === "interrupted" && <p className="text-xs">The admin’s connection or execution session ended. This run did not report completion.</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
