"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CodeView } from "@/components/ui/CodeView";
import { PhoneSheet } from "@/components/ui/PhoneSheet";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { CheckResults } from "@/components/workspace/CheckResults";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { formatRelative, formatShortDate, formatTime, isSameDay } from "@/lib/format";
import { diffOutputs, outputWords, type OutputWord } from "@/lib/outputDiff";
import { useNow } from "@/lib/useNow";
import { type Group, useGroup } from "./GroupContext";

type Options = FunctionReturnType<typeof api.review.options>;
type Queue = NonNullable<FunctionReturnType<typeof api.review.queue>>;
type QueueRow = Queue["rows"][number];
type Detail = NonNullable<FunctionReturnType<typeof api.review.attempt>>;
type Selected = NonNullable<Detail["selected"]>;
type AttemptStatus = Detail["attempts"][number]["status"];

const stateLabel: Record<QueueRow["state"], { text: string; tone: PillTone }> = {
  newAttempt: { text: "New attempt", tone: "amberSolid" },
  unreviewed: { text: "Unreviewed", tone: "amber" },
  reviewed: { text: "Reviewed", tone: "violet" },
  notTurnedIn: { text: "Not turned in", tone: "neutral" },
};

const attemptWord: Record<AttemptStatus, string> = {
  unreviewed: "new",
  reviewed: "reviewed",
  superseded: "replaced",
};

const outcomeWord = { complete: "completion", partial: "partial", none: "no completion" } as const;

const runNote = {
  ok: null,
  error: "The program stopped with an error; parts were checked against the output before it.",
  limit: "The loop was watched for 1,000 rounds, then stopped on purpose.",
  timeout: "The program didn’t finish within 10 seconds; parts were checked against the output so far.",
} as const;

const partKind = {
  begins: "Begins with",
  containsInOrder: "Contains, in order",
  ends: "Ends with",
  equals: "Is exactly",
} as const;

const selectClass =
  "h-10 max-w-[320px] rounded-[10px] border-[1.5px] border-bd bg-bg px-3 text-[15px] font-bold text-ink max-md:h-11 max-md:w-full max-md:max-w-none";

const isWaiting = (row: QueueRow) => row.state === "newAttempt" || row.state === "unreviewed";

type Choice = Options["days"][number]["assignments"][number] & { day: Options["days"][number] };

/** The most recent day with work waiting, else the latest lesson so far, else the first. */
function defaultChoice(days: Options["days"], now: number): Choice | null {
  const all = days.flatMap((day) => day.assignments.map((a) => ({ ...a, day })));
  for (const choice of [...all].reverse()) if (choice.waiting > 0) return choice;
  const past = all.filter((c) => c.day.lessonAt !== null && c.day.lessonAt <= now);
  return past[past.length - 1] ?? all[0] ?? null;
}

/** 4j. Submitted snapshots with expected vs actual output, checks and optional feedback. */
export function ReviewScreen() {
  const { group } = useGroup();
  const now = useNow();
  const options = useQuery(api.review.options, { group });
  const [picked, setPicked] = useState<{ group: Group; assignmentId: Id<"assignments"> } | null>(null);

  const choices = useMemo(
    () => options?.days.flatMap((day) => day.assignments.map((a) => ({ ...a, day }))) ?? [],
    [options],
  );
  const current =
    choices.find((c) => picked?.group === group && c._id === picked.assignmentId) ??
    (options ? defaultChoice(options.days, now) : null);
  const queue = useQuery(api.review.queue, current ? { assignmentId: current._id } : "skip");

  if (options === undefined) return <LoadingState label="Loading review…" />;
  const pick = (assignmentId: Id<"assignments">) => setPicked({ group, assignmentId });
  const daysWithWork = options.days.filter((d) => d.assignments.length > 0);

  return (
    <main className="flex flex-col pb-10">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 px-4 pt-4 md:px-7">
        <h1 className="m-0 text-[34px] leading-[1.04] font-extrabold tracking-[-.035em] md:text-[46px]">
          Review
        </h1>
        {current && (
          <>
            <select
              aria-label="Day"
              className={`${selectClass} mb-0.5`}
              value={current.day._id}
              onChange={(event) => {
                const day = daysWithWork.find((d) => d._id === event.target.value);
                const first = day?.assignments.find((a) => a.waiting > 0) ?? day?.assignments[0];
                if (first) pick(first._id);
              }}
            >
              {daysWithWork.map((day) => {
                const waiting = day.assignments.reduce((sum, a) => sum + a.waiting, 0);
                return (
                  <option key={day._id} value={day._id}>
                    Day {day.order}: {day.topic}
                    {waiting > 0 ? ` (${waiting} waiting)` : ""}
                  </option>
                );
              })}
            </select>
            <select
              aria-label="Assignment"
              className={`${selectClass} mb-0.5`}
              value={current._id}
              onChange={(event) => pick(event.target.value as Id<"assignments">)}
            >
              {current.day.assignments.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.title}
                  {a.waiting > 0 ? ` (${a.waiting} waiting)` : ""}
                </option>
              ))}
            </select>
          </>
        )}
        {queue && (
          <span className="mb-2.5 text-sm font-semibold text-ink2 md:ml-auto">
            {queue.waiting} waiting for review
          </span>
        )}
      </div>

      {current === null ? (
        <EmptyState title="Nothing to review yet" className="mx-4 mt-6 md:mx-7">
          {options.curriculum
            ? `${options.curriculum.name} has no published assignments.`
            : "This group has no curriculum yet."}
        </EmptyState>
      ) : queue === undefined ? (
        <LoadingState label="Loading submissions…" />
      ) : queue === null ? (
        <EmptyState title="This assignment wasn’t found" className="mx-4 mt-6 md:mx-7">
          Pick another day or assignment.
        </EmptyState>
      ) : queue.rows.length === 0 ? (
        <EmptyState title="No students yet" className="mx-4 mt-6 md:mx-7">
          Nobody in {options.curriculum?.name ?? "this curriculum"} has this assignment yet.
        </EmptyState>
      ) : (
        <ReviewBody key={current._id} queue={queue} timeZone={options.timeZone} now={now} />
      )}
    </main>
  );
}

function ReviewBody({ queue, timeZone, now }: { queue: Queue; timeZone: string; now: number }) {
  // Starts on the first row and stays on that student when reviewing re-sorts the queue.
  const [selection, setSelection] = useState<{ studentId: Id<"students">; attempt: number | null }>(
    () => ({ studentId: queue.rows[0]!.studentId, attempt: null }),
  );
  // Phones show the queue alone; picking a student opens their attempt as a sheet.
  const [detailOpen, setDetailOpen] = useState(false);
  const rows = queue.rows;
  const row = rows.find((r) => r.studentId === selection.studentId) ?? rows[0]!;
  const detail = useQuery(api.review.attempt, {
    assignmentId: queue.assignment._id,
    studentId: row.studentId,
    attempt: selection.studentId === row.studentId ? (selection.attempt ?? undefined) : undefined,
  });

  const index = rows.indexOf(row);
  const next = [...rows.slice(index + 1), ...rows.slice(0, index)].find(isWaiting) ?? null;
  const select = (studentId: Id<"students">, attempt: number | null = null) => {
    setSelection({ studentId, attempt });
    setDetailOpen(true);
  };
  const goNext = next ? () => select(next.studentId) : null;

  const rowSummary = (r: QueueRow) => {
    if (r.attempt === null || r.submittedAt === null) {
      return r.savedAt === null ? "Not started" : `Working copy saved ${formatRelative(r.savedAt, now, timeZone)}`;
    }
    const at = isSameDay(r.submittedAt, now, timeZone)
      ? formatTime(r.submittedAt, timeZone)
      : formatShortDate(r.submittedAt, timeZone);
    const result = r.outcome
      ? outcomeWord[r.outcome]
      : queue.assignment.type === "guided"
        ? "not checked"
        : "open-ended";
    return `Attempt ${r.attempt} · ${at} · ${result}`;
  };

  return (
    <div className="grid gap-4 px-4 pt-3.5 md:px-7 xl:grid-cols-[272px_minmax(0,1fr)_372px]">
      <nav aria-label="Submissions" className="flex flex-col gap-0.5 self-start rounded-[20px] bg-sf p-2">
        {rows.map((r) => {
          const current = r.studentId === row.studentId;
          const label = stateLabel[r.state];
          return (
            <button
              key={r.studentId}
              type="button"
              aria-current={current || undefined}
              onClick={() => select(r.studentId)}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 rounded-[14px] border-0 px-3 py-2.5 text-left text-ink",
                current ? "bg-pill shadow-[0_1px_2px_rgba(14,23,20,.12)]" : "bg-transparent hover:bg-sf2",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <b className="truncate font-bold">{r.name}</b>
                <Pill tone={label.tone} className="text-[11.5px]">
                  {label.text}
                </Pill>
              </span>
              <span className="w-full truncate text-[13px] text-ink3">{rowSummary(r)}</span>
            </button>
          );
        })}
      </nav>

      <PhoneSheet
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={`${row.name} · ${queue.assignment.title}`}
        backLabel="Queue"
      >
        {detail === undefined ? (
          <div className="xl:col-span-2">
            <LoadingState label="Loading attempt…" />
          </div>
        ) : detail === null ? (
          <EmptyState title="This student wasn’t found" className="xl:col-span-2">
            Pick someone else from the list.
          </EmptyState>
        ) : (
          <>
            <Snapshot
              key={`${detail.student._id}:${detail.selected?._id ?? "none"}`}
              detail={detail}
              queue={queue}
              timeZone={timeZone}
              now={now}
              onAttempt={(attempt) => select(row.studentId, attempt)}
            />
            <ReviewPanel
              key={`${detail.selected?._id ?? detail.student._id}:${detail.selected?.status}:${detail.selected?.feedback}:${detail.selected?.privateNote}`}
              detail={detail}
              guided={queue.assignment.type === "guided"}
              timeZone={timeZone}
              onAttempt={(attempt) => select(row.studentId, attempt)}
              onNext={goNext}
            />
          </>
        )}
      </PhoneSheet>
    </div>
  );
}

function Snapshot({
  detail,
  queue,
  timeZone,
  now,
  onAttempt,
}: {
  detail: Detail;
  queue: Queue;
  timeZone: string;
  now: number;
  onAttempt: (attempt: number) => void;
}) {
  const { student, selected } = detail;
  const files = selected?.files ?? [];
  const [shown, setShown] = useState(
    files.find((f) => f.name === "main.py")?.name ?? files[0]?.name ?? null,
  );
  const file = files.find((f) => f.name === shown) ?? files[0] ?? null;
  const liveLink = (
    <Link href="/admin/assistance" className="ml-auto font-bold whitespace-nowrap text-mint-i no-underline max-md:py-2.5">
      Open live working copy →
    </Link>
  );

  return (
    <section aria-label="Submitted snapshot" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h2 className="m-0 text-[26px] leading-[1.15] font-extrabold tracking-[-.03em]">{student.name}</h2>
        <span className="text-sm text-ink3">
          {student.loginCode} · Day {queue.day.order} · {queue.assignment.title}
        </span>
      </div>

      {selected === null ? (
        <div className="flex flex-col gap-2 rounded-[18px] bg-sf px-5 py-4">
          <b className="font-bold">
            {student.firstName} hasn’t turned in {queue.assignment.title}.
          </b>
          <span className="flex flex-wrap gap-2 text-sm text-ink2">
            {detail.savedAt === null
              ? "They haven’t opened it yet."
              : `Their working copy was saved ${formatRelative(detail.savedAt, now, timeZone)}.`}
            {detail.savedAt !== null && liveLink}
          </span>
        </div>
      ) : (
        <>
          <SegmentedControl
            label="Attempts"
            className="max-w-full flex-wrap self-start bg-sf [&>button]:h-8 max-md:[&>button]:h-11"
            options={detail.attempts.map((a) => ({
              value: String(a.attempt),
              label: `Attempt ${a.attempt} · ${attemptWord[a.status]}`,
            }))}
            value={String(selected.attempt)}
            onChange={(value) => onAttempt(Number(value))}
          />
          <div className="scheme-dark overflow-hidden rounded-[18px] bg-code-bg text-code-ink">
            <div className="flex min-h-[42px] flex-wrap items-center gap-x-2.5 gap-y-1 bg-code-bar px-3.5 py-1.5 text-[13px]">
              {files.length > 1 ? (
                <span role="group" aria-label="Files" className="flex flex-wrap gap-1">
                  {files.map((f) => (
                    <button
                      key={f.name}
                      type="button"
                      aria-pressed={f.name === file?.name}
                      onClick={() => setShown(f.name)}
                      className={cn(
                        "h-7 cursor-pointer rounded-lg border-0 px-2.5 font-mono text-[13px]",
                        f.name === file?.name
                          ? "bg-code-bg font-semibold text-code-ink"
                          : "bg-transparent text-ink3 hover:text-code-ink",
                      )}
                    >
                      {f.name}
                    </button>
                  ))}
                </span>
              ) : (
                <b className="font-mono text-[13px] font-semibold">{file?.name}</b>
              )}
              <span className="text-ink3">Submitted snapshot · v{selected.versionNumber} · read-only</span>
              {liveLink}
            </div>
            {file ? (
              <CodeView
                code={file.content}
                label={`${student.name}'s submitted ${file.name}`}
                className="max-h-[420px] py-3 text-sm leading-6"
              />
            ) : (
              <p className="m-0 px-4 py-3 text-sm text-ink3">This snapshot has no files.</p>
            )}
          </div>
          <OutputCompare selected={selected} />
        </>
      )}
    </section>
  );
}

function Words({ words, tone }: { words: OutputWord[]; tone: "mint" | "coral" }) {
  if (words.length === 0) return <span className="font-sans text-ink3">(no output)</span>;
  return words.map((word, i) => (
    <span key={i}>
      {i > 0 && " "}
      {word.matched ? (
        word.text
      ) : (
        <span className={cn("rounded px-1", tone === "mint" ? "bg-mint-s2 text-mint-i" : "bg-cor-s text-cor-i")}>
          {word.text}
        </span>
      )}
    </span>
  ));
}

/** Expected output (or the task's parts) beside what the check printed, words compared. */
function OutputCompare({ selected }: { selected: Selected }) {
  const expected = selected.expectedOutput;
  const actual = selected.check?.output ?? null;
  const diff = useMemo(
    () => (expected !== null && actual !== null ? diffOutputs(expected, actual) : null),
    [expected, actual],
  );
  if (expected === null && selected.expectedParts.length === 0 && actual === null) return null;
  const pre = "m-0 max-h-[200px] overflow-auto font-mono text-[13px] leading-normal font-medium whitespace-pre-wrap";
  const plain = (text: string) => outputWords(text).map((word) => ({ text: word, matched: true }));

  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-sf px-3.5 py-3">
          <b className="text-[13px] font-bold">Expected</b>
          {expected !== null ? (
            <pre className={pre}>
              <Words words={diff?.expected ?? plain(expected)} tone="mint" />
            </pre>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
              {selected.expectedParts.map((part) => (
                <li key={part.name}>
                  <span className="text-ink3">{partKind[part.kind]}</span>{" "}
                  <code className="font-mono font-medium">{part.expected}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-sf px-3.5 py-3">
          <b className="text-[13px] font-bold">Actual · v{selected.versionNumber}</b>
          {actual === null ? (
            <span className="text-[13px] text-ink3">
              {selected.check
                ? "This check was recorded before output was kept."
                : "Not checked, so there’s no output to compare."}
            </span>
          ) : (
            <pre className={pre}>
              <Words words={diff?.actual ?? plain(actual)} tone="coral" />
              {selected.check?.outputTruncated && (
                <span className="font-sans text-xs text-ink3"> … (only the start was kept)</span>
              )}
            </pre>
          )}
        </div>
      </div>
      <span className="text-[12.5px] text-ink3">
        Lines shown joined. Line breaks don’t count.
        {diff && !diff.compared && " Too long to mark differences."}
      </span>
    </>
  );
}

function ReviewPanel({
  detail,
  guided,
  timeZone,
  onAttempt,
  onNext,
}: {
  detail: Detail;
  guided: boolean;
  timeZone: string;
  onAttempt: (attempt: number) => void;
  onNext: (() => void) | null;
}) {
  const { selected, student } = detail;
  const markReviewed = useMutation(api.review.markReviewed);
  const ids = useId();
  const [feedbackOpen, setFeedbackOpen] = useState(selected?.feedback != null);
  const [feedback, setFeedback] = useState(selected?.feedback ?? "");
  const [noteOpen, setNoteOpen] = useState(selected?.privateNote != null);
  const [note, setNote] = useState(selected?.privateNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextButton = (
    <Button
      variant="secondary"
      className="h-[46px] rounded-xl bg-bg text-[15px]"
      disabled={onNext === null}
      title={onNext === null ? "No one else is waiting for review." : undefined}
      onClick={() => onNext?.()}
    >
      Next →
    </Button>
  );

  if (selected === null) {
    return (
      <aside aria-label="Check and review" className="flex flex-col gap-3 self-start rounded-[24px] bg-sf px-[18px] py-4">
        <span className="text-sm text-ink2">Nothing to review until {student.firstName} turns this in.</span>
        <div className="mt-2 flex justify-end">{nextButton}</div>
      </aside>
    );
  }

  const reviewed = selected.status === "reviewed";
  const feedbackText = feedbackOpen ? feedback.trim() : "";
  const noteText = noteOpen ? note.trim() : "";
  const changed = feedbackText !== (selected.feedback ?? "") || noteText !== (selected.privateNote ?? "");
  const others = detail.attempts.filter((a) => a.attempt !== selected.attempt).reverse();
  const newest = detail.attempts[detail.attempts.length - 1];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await markReviewed({ submissionId: selected._id, feedback: feedbackText, privateNote: noteText });
    } catch (e) {
      setError(errorMessage(e, "Couldn’t save the review. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside aria-label="Check and review" className="flex flex-col gap-3 self-start rounded-[24px] bg-sf px-[18px] py-4">
      <div className="flex items-start justify-between gap-2">
        {selected.check ? (
          <CheckResults
            outcome={selected.check.outcome}
            parts={selected.check.parts}
            partialMin={selected.check.partialMin}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <Pill tone="neutral" className="h-7 px-3 text-[13px]">
              Not checked
            </Pill>
            <span className="text-[13px] text-ink2">
              {guided
                ? "This attempt wasn’t checked before it was turned in."
                : "Open-ended: there’s no automatic check."}
            </span>
          </div>
        )}
        <span className="text-[12.5px] whitespace-nowrap text-ink3">
          Attempt {selected.attempt} · v{selected.versionNumber}
        </span>
      </div>
      {selected.check?.runOutcome && runNote[selected.check.runOutcome] && (
        <span className="-mt-1 text-[12.5px] text-ink3">{runNote[selected.check.runOutcome]}</span>
      )}
      {selected.olderTask && (
        <span role="note" className="rounded-xl bg-amb-s px-3 py-2 text-[12.5px] text-amb-i">
          <b className="font-bold">Older task version.</b> Turned in for{" "}
          {selected.taskVersion !== null ? `task v${selected.taskVersion}` : "an earlier version of the task"}
          {selected.currentTaskVersion !== null && `; the task is now v${selected.currentTaskVersion}`}. Its
          check and expected output are the ones it was judged with.
        </span>
      )}
      {selected.check && selected.taskVersion !== null && selected.check.taskVersion !== selected.taskVersion && (
        <span className="-mt-1 text-[12.5px] text-ink3">
          This check used task v{selected.check.taskVersion}.
        </span>
      )}

      {others.map((a) => (
        <button
          key={a.attempt}
          type="button"
          onClick={() => onAttempt(a.attempt)}
          className="cursor-pointer rounded-[14px] border-0 bg-bg px-3 py-2.5 text-left text-[13px] text-ink2 hover:bg-sf2"
        >
          <b className="font-bold text-ink">Attempt {a.attempt}</b> ·{" "}
          {a.status === "reviewed"
            ? `reviewed ${a.reviewedAt ? formatShortDate(a.reviewedAt, timeZone) : ""} · ${
                a.hasFeedback ? "has written feedback" : "no written note"
              }${a.hasNote ? " · private note" : ""}`
            : a.status === "superseded"
              ? `replaced by a later attempt before review${a.hasNote ? " · private note" : ""}`
              : "waiting for review"}
        </button>
      ))}

      {!selected.latest ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-bg p-3 text-sm">
          {selected.feedback && (
            <p className="m-0 whitespace-pre-line">
              <b className="font-bold">Written feedback:</b> {selected.feedback}
            </p>
          )}
          {selected.privateNote && (
            <p className="m-0 whitespace-pre-line">
              <b className="font-bold">Private note:</b> {selected.privateNote}
            </p>
          )}
          <span className="text-ink3">
            {selected.status === "superseded"
              ? `${student.firstName} turned in attempt ${newest?.attempt} before this one was reviewed, so it left the queue.`
              : "Only the latest attempt can be reviewed."}
          </span>
        </div>
      ) : (
        <>
          {reviewed && (
            <span className="text-[13px] font-semibold text-vio-i">
              ✓ Reviewed{selected.reviewerName ? ` by ${selected.reviewerName}` : ""}
              {selected.reviewedAt ? ` · ${formatShortDate(selected.reviewedAt, timeZone)}` : ""}. {student.firstName}{" "}
              can see it.
            </span>
          )}
          <div className="flex flex-col gap-2 rounded-2xl bg-bg p-3">
            {feedbackOpen ? (
              <>
                <label htmlFor={`${ids}-feedback`} className="text-sm font-bold">
                  Written feedback{" "}
                  <span className="font-medium text-ink3">· optional · {student.firstName} sees this</span>
                </label>
                <textarea
                  id={`${ids}-feedback`}
                  rows={3}
                  value={feedback}
                  maxLength={4000}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={`Write a note for ${student.firstName}…`}
                  className="min-h-[88px] rounded-xl border-[1.5px] border-bd bg-bg px-3 py-2.5 text-sm text-ink"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start max-md:h-10"
                  onClick={() => {
                    setFeedbackOpen(false);
                    setFeedback("");
                  }}
                >
                  Remove
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="lg" className="self-start" onClick={() => setFeedbackOpen(true)}>
                  + Add written feedback
                </Button>
                <span className="text-[13px] text-ink3">Optional. Skip it if you talked it through in class.</span>
              </>
            )}
          </div>
          {noteOpen ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-bg p-3">
              <label htmlFor={`${ids}-note`} className="text-sm font-bold">
                Private note <span className="font-medium text-ink3">· admins only</span>
              </label>
              <textarea
                id={`${ids}-note`}
                rows={2}
                value={note}
                maxLength={4000}
                onChange={(e) => setNote(e.target.value)}
                className="rounded-xl border-[1.5px] border-bd bg-bg px-3 py-2.5 text-sm text-ink"
              />
              <Button
                variant="ghost"
                size="sm"
                className="self-start max-md:h-10"
                onClick={() => {
                  setNoteOpen(false);
                  setNote("");
                }}
              >
                Remove
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="self-start" onClick={() => setNoteOpen(true)}>
              + Private note · admins only
            </Button>
          )}
          {error && (
            <span role="alert" className="text-[13px] font-semibold text-cor-i">
              {error}
            </span>
          )}
        </>
      )}

      <div className="mt-2 flex gap-2">
        {selected.latest && (
          <Button
            variant="primary"
            className="h-[46px] flex-1 rounded-xl text-[15px]"
            loading={saving}
            loadingLabel="Saving…"
            disabled={reviewed && !changed}
            onClick={() => void save()}
          >
            {reviewed ? "Save changes" : "Mark reviewed"}
          </Button>
        )}
        {nextButton}
      </div>
    </aside>
  );
}
