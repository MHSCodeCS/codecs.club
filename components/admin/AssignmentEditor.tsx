"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, TextInput } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { CodeEditor } from "@/components/workspace/CodeEditor";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  draftProblem,
  MAX_CHECK_INPUT_LENGTH,
  MAX_EXPECTED_OUTPUT_LENGTH,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_PART_EXPECTED_LENGTH,
  MAX_PART_NAME_LENGTH,
  MAX_PARTS,
  MAX_STARTER_FILES,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeDraft,
  publishProblem,
  sameDraft,
  type DraftContent,
} from "@/convex/lib/assignmentRules";
import { compareFileNames, fileNameProblem } from "@/convex/lib/workFiles";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { partKindLabel, validatePartialRule, type PartKind } from "@/lib/evaluation";
import { formatShortDate, formatTime, isSameDay } from "@/lib/format";
import { renderInlineMarkdown } from "@/lib/inlineMarkdown";
import { useNow } from "@/lib/useNow";
import { NewAssignmentForm } from "./NewAssignmentForm";

type EditorData = NonNullable<typeof api.adminAssignments.get._returnType>;
type Base = { revisionId: Id<"assignmentRevisions">; savedAt: number; content: DraftContent };

const PART_KINDS = Object.keys(partKindLabel) as PartKind[];
const LEAVE_PROMPT = "You have unsaved changes to this assignment. Leave without saving?";

const textareaClass =
  "block w-full resize-y rounded-[14px] border-[1.5px] border-bd bg-bg px-3.5 py-3 font-mono text-sm text-ink outline-none focus-visible:border-vio";

/** 4h. Guided/open-ended authoring with drafts, publishing and task versions (D08). */
export function AssignmentEditor({ assignmentId }: { assignmentId: string }) {
  const data = useQuery(api.adminAssignments.get, { assignmentId });
  const [reloads, setReloads] = useState(0);
  if (data === undefined) return <LoadingState label="Loading the assignment…" />;
  if (data === null) {
    return (
      <main className="px-4 pt-6 md:px-7">
        <EmptyState title="Assignment not found">
          It may have been removed. <Link href="/admin/assignments">Back to Assignments</Link>
        </EmptyState>
      </main>
    );
  }
  return (
    <EditorForm
      key={`${data.assignment._id}:${reloads}`}
      data={data}
      onReload={() => setReloads((n) => n + 1)}
    />
  );
}

function EditorForm({ data, onReload }: { data: EditorData; onReload: () => void }) {
  const router = useRouter();
  const saveDraft = useMutation(api.adminAssignments.saveDraft);
  const publishMutation = useMutation(api.adminAssignments.publish);
  const unpublishMutation = useMutation(api.adminAssignments.unpublish);
  const removeMutation = useMutation(api.adminAssignments.remove);
  const moveMutation = useMutation(api.adminAssignments.move);

  const { assignment, day, timeZone } = data;
  const now = useNow();
  const [base, setBase] = useState<Base>({
    revisionId: data.draft.revisionId,
    savedAt: data.draft.savedAt,
    content: data.draft.content,
  });
  const [draft, setDraft] = useState<DraftContent>(data.draft.content);
  const [busy, setBusy] = useState<null | "save" | "publish" | "unpublish" | "remove" | "move">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const normalized = normalizeDraft(draft);
  const dirty = !sameDraft(normalized, normalizeDraft(base.content));
  const saveBlocker = draftProblem(normalized);
  const publishBlocker = publishProblem(normalized);
  const upToDate =
    !dirty && assignment.status === "published" && !assignment.unpublishedChanges;
  // Someone else saved after this editor loaded (hidden while our own save lands).
  const savedElsewhere =
    busy === null && (data.draft.revisionId !== base.revisionId || data.draft.savedAt !== base.savedAt);
  const dayLabel = `Day ${day.order}`;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const guardLeave = (event: MouseEvent) => {
    if (dirty && !window.confirm(LEAVE_PROMPT)) event.preventDefault();
  };
  const edit = (patch: Partial<DraftContent>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setNotice(null);
  };

  async function save(): Promise<Base | null> {
    const result = await saveDraft({
      assignmentId: assignment._id,
      baseRevisionId: base.revisionId,
      baseSavedAt: base.savedAt,
      draft,
    });
    const next = { revisionId: result.revisionId, savedAt: result.savedAt, content: normalized };
    setBase(next);
    setDraft(normalized);
    return next;
  }

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<string | null>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const onSave = () =>
    run("save", async () => {
      await save();
      return "Draft saved. Students don’t see it until you publish.";
    });

  const onPublish = () =>
    run("publish", async () => {
      const saved = dirty ? await save() : base;
      if (saved === null) return null;
      const result = await publishMutation({ assignmentId: assignment._id, revisionId: saved.revisionId });
      return result.version > 1
        ? `Published task version ${result.version}. Students’ files and earlier results stay as they were.`
        : `Published to ${dayLabel}.`;
    });

  const onUnpublish = () => {
    if (!window.confirm(`Hide ${assignment.title} from students? Anyone who started keeps their work.`)) return;
    void run("unpublish", async () => {
      await unpublishMutation({ assignmentId: assignment._id });
      return "Unpublished. It’s hidden from the lesson day; students who started keep their work.";
    });
  };

  const onRemove = () => {
    if (!window.confirm(`Remove the draft ${assignment.title}? This can’t be undone.`)) return;
    void run("remove", async () => {
      await removeMutation({ assignmentId: assignment._id });
      router.push("/admin/assignments");
      return null;
    });
  };

  const onMove = (direction: "up" | "down") =>
    run("move", async () => {
      await moveMutation({ assignmentId: assignment._id, direction });
      return null;
    });

  const position = data.siblings.findIndex((s) => s._id === assignment._id);
  const statusPill =
    assignment.status === "published" ? (
      <Pill tone="mint" className="mb-2 h-7 px-3 text-[13px]">
        ● Published · task v{assignment.publishedVersion}
        {assignment.unpublishedChanges && ` · draft saved ${savedLabel(base.savedAt, now, timeZone)}`}
      </Pill>
    ) : (
      <Pill tone="amber" className="mb-2 h-7 px-3 text-[13px]">
        ○ {assignment.publishedVersion === null ? "Draft" : "Unpublished"} · saved{" "}
        {savedLabel(base.savedAt, now, timeZone)}
      </Pill>
    );

  return (
    <main className="flex flex-col pb-10">
      <div className="flex flex-wrap items-end gap-x-3.5 gap-y-2 px-4 pt-4 md:px-7">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-sm text-ink3">
            <Link href="/admin/assignments" onClick={guardLeave} className="text-ink2 no-underline hover:text-ink">
              {dayLabel}: {day.topic}
            </Link>{" "}
            / Assignments
          </nav>
          <h1 className="m-0 mt-0.5 text-[34px] leading-[1.04] font-extrabold tracking-[-.035em] break-words md:text-[46px]">
            {draft.title.trim() || "Untitled assignment"}
          </h1>
        </div>
        {statusPill}
        {dirty && <span className="mb-[13px] text-[13px] font-semibold text-amb-i">Unsaved changes</span>}
        <div className="mb-0.5 flex flex-wrap gap-2 max-md:w-full max-md:[&>button]:h-11 max-md:[&>button]:flex-1 md:ml-auto">
          <Button
            variant="secondary"
            size="lg"
            className="h-[42px]"
            disabled={!dirty || saveBlocker !== null || busy !== null}
            loading={busy === "save"}
            loadingLabel="Saving…"
            title={saveBlocker ?? undefined}
            onClick={() => void onSave()}
          >
            Save draft
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="h-[42px]"
            disabled={upToDate || publishBlocker !== null || busy !== null}
            loading={busy === "publish"}
            loadingLabel="Publishing…"
            title={publishBlocker ?? undefined}
            onClick={() => void onPublish()}
          >
            {upToDate
              ? "Published"
              : assignment.status === "published"
                ? "Publish changes"
                : `Publish to ${dayLabel}`}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-2 md:px-7" aria-live="polite">
        {savedElsewhere && (
          <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-amb-s px-3.5 py-2 text-[13px] text-amb-i">
            <span>Someone else saved this assignment after you opened it. Saving now would be refused.</span>
            <Button size="sm" variant="secondary" className="max-md:h-11" onClick={onReload}>
              Reload their version
            </Button>
          </div>
        )}
        {error && <FieldError id="assignment-error">{error}</FieldError>}
        {notice && !error && (
          <span role="status" className="text-[13px] font-semibold text-mint-i">
            ✓ {notice}
          </span>
        )}
        {!error && !notice && (saveBlocker ?? (dirty || !upToDate ? publishBlocker : null)) && (
          <span className="text-[13px] text-ink3">
            {saveBlocker ? `Can’t save yet: ${saveBlocker}` : `Before publishing: ${publishBlocker}`}
          </span>
        )}
      </div>

      <div className="grid gap-[18px] px-4 pt-3 md:px-7 xl:grid-cols-[216px_minmax(0,1fr)_468px]">
        <nav aria-label={`${dayLabel} assignments`} className="flex flex-col gap-0.5 self-start rounded-[20px] bg-sf p-2">
          <b className="px-2.5 pt-1.5 pb-2 text-xs font-bold tracking-[.05em] text-ink3">
            {dayLabel.toUpperCase()} · {day.topic.toUpperCase()}
          </b>
          {data.siblings.map((s) => {
            const current = s._id === assignment._id;
            const label = (
              <>
                <b className="text-sm font-bold">{current ? draft.title.trim() || s.title : s.title}</b>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    s.status === "published" ? "text-mint-i" : "text-amb-i",
                  )}
                >
                  {s.status === "published" ? "● Published" : "○ Draft"}
                  {s.unpublishedChanges ? " · edits" : ""} · {s.type === "guided" ? "guided" : "open-ended"}
                </span>
              </>
            );
            return current ? (
              <div
                key={s._id}
                aria-current="page"
                className="flex min-h-11 items-center gap-1 rounded-xl bg-pill py-1 pr-1 pl-3 shadow-[0_1px_2px_rgba(14,23,20,.12)]"
              >
                <span className="flex min-w-0 flex-1 flex-col">{label}</span>
                <span className="flex flex-none">
                  <MoveButton label="Move up" disabled={position <= 0 || busy !== null} onClick={() => void onMove("up")}>
                    ↑
                  </MoveButton>
                  <MoveButton
                    label="Move down"
                    disabled={position >= data.siblings.length - 1 || busy !== null}
                    onClick={() => void onMove("down")}
                  >
                    ↓
                  </MoveButton>
                </span>
              </div>
            ) : (
              <Link
                key={s._id}
                href={`/admin/assignments/${s._id}`}
                onClick={guardLeave}
                className="flex min-h-11 flex-col justify-center rounded-xl px-3 py-[9px] text-ink no-underline hover:bg-sf2"
              >
                {label}
              </Link>
            );
          })}
          <NewAssignmentForm dayId={day._id} dayLabel={dayLabel} className="mt-0.5" buttonClassName="mt-0.5" />
        </nav>

        <section aria-label="Assignment details" className="flex min-w-0 flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Type</span>
            <SegmentedControl
              label="Type"
              className="self-start bg-sf [&>button]:h-[34px] max-md:[&>button]:h-11"
              options={[
                { value: "guided", label: "Guided" },
                { value: "open", label: "Open-ended" },
              ]}
              value={draft.type}
              onChange={(type) => edit({ type })}
            />
            <span className="text-[12.5px] text-ink3">
              Guided work is checked against expected output. Open-ended work starts from a blank
              file and gets feedback only.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="assignment-title" className="text-sm font-bold">
              Title
            </label>
            <TextInput
              id="assignment-title"
              className="h-11"
              maxLength={MAX_TITLE_LENGTH}
              value={draft.title}
              onChange={(e) => edit({ title: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="assignment-summary" className="text-sm font-bold">
              Summary
            </label>
            <TextInput
              id="assignment-summary"
              className="h-11"
              maxLength={MAX_SUMMARY_LENGTH}
              value={draft.summary}
              placeholder="One line students see on the lesson day"
              onChange={(e) => edit({ summary: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="assignment-instructions" className="text-sm font-bold">
              Instructions
            </label>
            <div className="overflow-hidden rounded-[14px] border-[1.5px] border-bd focus-within:border-vio">
              <textarea
                id="assignment-instructions"
                value={draft.instructions}
                maxLength={MAX_INSTRUCTIONS_LENGTH}
                onChange={(e) => edit({ instructions: e.target.value })}
                rows={4}
                className="block w-full resize-y border-0 bg-bg px-3.5 py-3 font-mono text-sm text-ink outline-none"
                aria-describedby="instructions-hint"
              />
              <div className="border-t border-ln bg-sf px-3.5 py-2.5 text-[15px] whitespace-pre-line">
                <span className="mb-1 block text-xs font-bold text-ink3">Students see</span>
                {draft.instructions.trim() ? (
                  renderInlineMarkdown(draft.instructions)
                ) : (
                  <span className="text-ink3">Nothing yet.</span>
                )}
              </div>
            </div>
            <span id="instructions-hint" className="text-[12.5px] text-ink3">
              Use **bold** and `code`.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="assignment-expected" className="text-sm font-bold">
              Expected output <span className="font-normal text-ink3">(optional)</span>
            </label>
            <textarea
              id="assignment-expected"
              value={draft.expectedOutput}
              maxLength={MAX_EXPECTED_OUTPUT_LENGTH}
              onChange={(e) => edit({ expectedOutput: e.target.value })}
              rows={3}
              className={textareaClass}
              aria-describedby="expected-hint"
            />
            <span id="expected-hint" className="text-[12.5px] text-ink3">
              Shown beside the task as an example. The checks below decide the result.
            </span>
          </div>
          {draft.type === "guided" && (
            <StarterFiles files={draft.starterFiles} onChange={(starterFiles) => edit({ starterFiles })} />
          )}

          <div className="flex flex-col gap-2 rounded-[20px] bg-sf px-4 py-3.5 text-sm">
            <span className="text-ink2">
              {data.studentsWithWork === 0
                ? "No student has opened this yet."
                : `${data.studentsWithWork >= 300 ? "300+" : data.studentsWithWork} ${
                    data.studentsWithWork === 1 ? "student has" : "students have"
                  } work on this. Publishing changes keeps their files and earlier results; new checks use the new version. New starter files only reach students who open it later.`}
            </span>
            <div className="flex flex-wrap gap-2 max-md:[&>button]:h-11">
              {assignment.status === "published" && (
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  loading={busy === "unpublish"}
                  loadingLabel="Unpublishing…"
                  onClick={onUnpublish}
                >
                  Unpublish
                </Button>
              )}
              {assignment.status === "draft" && data.studentsWithWork === 0 && (
                <Button
                  variant="danger"
                  disabled={busy !== null}
                  loading={busy === "remove"}
                  loadingLabel="Removing…"
                  onClick={onRemove}
                >
                  Remove draft
                </Button>
              )}
            </div>
          </div>
        </section>

        {draft.type === "guided" ? (
          <Evaluation draft={draft} edit={edit} />
        ) : (
          <section aria-label="Evaluation" className="self-start rounded-[24px] bg-sf p-[18px]">
            <h2 className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-.02em]">Evaluation</h2>
            <p className="mt-2 mb-0 text-sm text-ink2">
              Open-ended work has no output checks. Students start from a blank file and you give
              feedback when you review it.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function savedLabel(ts: number, now: number, timeZone: string) {
  return isSameDay(ts, now, timeZone)
    ? formatTime(ts, timeZone)
    : `${formatShortDate(ts, timeZone)}, ${formatTime(ts, timeZone)}`;
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 cursor-pointer place-items-center rounded-[9px] border-0 bg-transparent font-bold text-ink2 hover:bg-sf2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 max-md:size-11"
    >
      {children}
    </button>
  );
}

/** Starter files: tabs, add, rename, delete, and the shown file in the code editor. */
function StarterFiles({
  files,
  onChange,
}: {
  files: DraftContent["starterFiles"];
  onChange: (files: DraftContent["starterFiles"]) => void;
}) {
  const [shown, setShown] = useState(files[0]?.name ?? null);
  const [naming, setNaming] = useState<null | { mode: "add" } | { mode: "rename"; from: string }>(null);
  const [name, setName] = useState("");
  const current = files.find((f) => f.name === shown) ?? files[0] ?? null;

  const nameProblem = (() => {
    const trimmed = name.trim();
    const problem = fileNameProblem(trimmed);
    if (problem) return problem;
    const clash = files.find(
      (f) =>
        f.name.toLowerCase() === trimmed.toLowerCase() &&
        !(naming?.mode === "rename" && f.name === naming.from),
    );
    return clash ? `There is already a file named ${clash.name}.` : null;
  })();

  const commitName = () => {
    if (naming === null || nameProblem !== null) return;
    const trimmed = name.trim();
    if (naming.mode === "add") {
      onChange([...files, { name: trimmed, content: "" }].sort((a, b) => compareFileNames(a.name, b.name)));
    } else {
      onChange(
        files
          .map((f) => (f.name === naming.from ? { ...f, name: trimmed } : f))
          .sort((a, b) => compareFileNames(a.name, b.name)),
      );
    }
    setShown(trimmed);
    setNaming(null);
  };

  const remove = (fileName: string) => {
    if (!window.confirm(`Delete the starter file ${fileName}?`)) return;
    const rest = files.filter((f) => f.name !== fileName);
    onChange(rest);
    setShown(rest[0]?.name ?? null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">Starter files</span>
      <div className="scheme-dark overflow-hidden rounded-[14px] bg-code-bg text-code-ink">
        <div role="tablist" aria-label="Starter files" className="flex min-h-[38px] flex-wrap items-center gap-1.5 bg-code-bar px-2 py-1">
          {files.map((f) => (
            <button
              key={f.name}
              type="button"
              role="tab"
              aria-selected={f.name === current?.name}
              onClick={() => setShown(f.name)}
              className={cn(
                "flex h-7 cursor-pointer items-center rounded-[7px] border-0 px-3 font-mono text-[12.5px] font-semibold max-md:h-10",
                f.name === current?.name ? "bg-code-bg text-code-ink" : "bg-transparent text-ink3 hover:text-code-ink",
              )}
            >
              {f.name}
            </button>
          ))}
          {files.length < MAX_STARTER_FILES && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[12.5px] max-md:h-10"
              onClick={() => {
                setNaming({ mode: "add" });
                setName("");
              }}
            >
              + Add file
            </Button>
          )}
          <span className="ml-auto text-xs text-ink3 max-md:hidden">Copied into each student’s workspace</span>
        </div>
        {naming && (
          <form
            className="flex flex-wrap items-start gap-2 border-b border-code-bar px-2.5 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              commitName();
            }}
          >
            <label htmlFor="starter-file-name" className="sr-only">
              {naming.mode === "add" ? "New file name" : `New name for ${naming.from}`}
            </label>
            <input
              id="starter-file-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setNaming(null)}
              placeholder="helpers.py"
              aria-invalid={(name.length > 0 && nameProblem !== null) || undefined}
              aria-describedby="starter-file-problem"
              className="h-8 min-w-0 flex-1 rounded-lg border-[1.5px] border-code-bar bg-code-bg px-2.5 font-mono text-[13px] text-code-ink outline-none focus-visible:border-vio max-md:h-11"
            />
            <Button type="submit" size="sm" variant="primary" disabled={nameProblem !== null} className="max-md:h-11">
              {naming.mode === "add" ? "Add" : "Rename"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNaming(null)} className="max-md:h-11">
              Cancel
            </Button>
            {name.length > 0 && nameProblem && (
              <span id="starter-file-problem" className="basis-full text-[12.5px] text-cor-i">
                {nameProblem}
              </span>
            )}
          </form>
        )}
        {current ? (
          <>
            <div className="h-[220px]">
              <CodeEditor
                fileName={current.name}
                readContent={(fileName) => files.find((f) => f.name === fileName)?.content ?? null}
                onChange={(fileName, content) =>
                  onChange(files.map((f) => (f.name === fileName ? { ...f, content } : f)))
                }
                readOnly={false}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-code-bar px-2 py-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[12.5px] max-md:h-10"
                onClick={() => {
                  setNaming({ mode: "rename", from: current.name });
                  setName(current.name);
                }}
              >
                Rename {current.name}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-[12.5px] max-md:h-10" onClick={() => remove(current.name)}>
                Delete
              </Button>
            </div>
          </>
        ) : (
          <p className="m-0 px-3.5 py-3 text-sm text-ink3">
            No starter files: students start with an empty main.py.
          </p>
        )}
      </div>
    </div>
  );
}

/** Parts with their checks, the partial-completion rule, the loop check and check input. */
function Evaluation({ draft, edit }: { draft: DraftContent; edit: (patch: Partial<DraftContent>) => void }) {
  const { parts, partialMin } = draft;
  const rule = validatePartialRule(parts.length, partialMin);
  const setPart = (index: number, patch: Partial<DraftContent["parts"][number]>) =>
    edit({ parts: parts.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  const removePart = (index: number) => {
    const next = parts.filter((_, i) => i !== index);
    edit({ parts: next, partialMin: Math.min(partialMin, next.length) });
  };

  return (
    <section aria-label="Evaluation" className="flex min-w-0 flex-col gap-2.5 self-start rounded-[24px] bg-sf p-[18px] max-md:px-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-.02em]">Evaluation</h2>
        <span className="text-[12.5px] text-ink3">Checks output only. Whitespace ignored.</span>
      </div>
      {parts.length === 0 && (
        <p className="m-0 text-sm text-ink3">Add the parts a program’s output must meet.</p>
      )}
      {parts.map((part, i) => (
        <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 rounded-2xl bg-bg p-3">
          <span className="row-span-3 grid size-7 place-items-center rounded-full bg-mint-s2 text-[13px] font-extrabold text-mint-i">
            {i + 1}
          </span>
          <div className="flex items-center gap-1.5">
            <input
              aria-label={`Part ${i + 1} name`}
              value={part.name}
              maxLength={MAX_PART_NAME_LENGTH}
              placeholder="What this part checks"
              onChange={(e) => setPart(i, { name: e.target.value })}
              className="h-9 min-w-0 flex-1 rounded-lg border-[1.5px] border-transparent bg-transparent px-1.5 text-sm font-bold text-ink outline-none hover:border-bd focus-visible:border-vio max-md:h-11"
            />
            <button
              type="button"
              aria-label={`Remove part ${i + 1}`}
              title="Remove part"
              onClick={() => removePart(i)}
              className="grid size-9 flex-none cursor-pointer place-items-center rounded-[9px] border-0 bg-transparent text-ink3 hover:bg-sf2 hover:text-cor-i max-md:size-11"
            >
              ✕
            </button>
          </div>
          <select
            aria-label={`Part ${i + 1} check`}
            value={part.kind}
            onChange={(e) => setPart(i, { kind: e.target.value as PartKind })}
            className="h-9 justify-self-start rounded-lg border-[1.5px] border-bd bg-bg px-2 text-[13px] text-ink2 max-md:h-11 max-md:w-full"
          >
            {PART_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {partKindLabel[kind]}
              </option>
            ))}
          </select>
          <textarea
            aria-label={`Part ${i + 1} expected output`}
            value={part.expected}
            maxLength={MAX_PART_EXPECTED_LENGTH}
            rows={Math.min(4, Math.max(1, part.expected.split("\n").length))}
            placeholder="Expected output"
            onChange={(e) => setPart(i, { expected: e.target.value })}
            className="block w-full resize-y rounded-lg border-[1.5px] border-transparent bg-sf px-[9px] py-[5px] font-mono text-[13px] font-medium text-ink outline-none focus-visible:border-vio"
          />
        </div>
      ))}
      {parts.length < MAX_PARTS && (
        <Button
          variant="secondary"
          className="self-start bg-bg max-md:h-11"
          onClick={() =>
            edit({
              parts: [...parts, { name: `Part ${parts.length + 1}`, kind: "containsInOrder", expected: "" }],
              // A first part needs no minimum; a second makes partial meaningful at 1.
              partialMin: parts.length === 1 && partialMin === 0 ? 1 : partialMin,
            })
          }
        >
          + Add part
        </Button>
      )}
      <div className="flex flex-col gap-1.5 rounded-2xl bg-bg p-3.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <b className="font-bold">Partial completion</b>
          <span className="text-ink2">needs at least</span>
          <span className="inline-flex items-center gap-0.5 rounded-[10px] bg-sf p-[3px]">
            <button
              type="button"
              aria-label="Fewer parts"
              onClick={() => edit({ partialMin: Math.max(0, partialMin - 1) })}
              className="grid size-[26px] cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent font-bold max-md:size-11"
            >
              −
            </button>
            <b
              aria-live="polite"
              className="grid h-[26px] min-w-[30px] place-items-center rounded-[7px] bg-pill font-extrabold shadow-[0_1px_2px_rgba(14,23,20,.12)] max-md:h-11 max-md:min-w-11"
            >
              {partialMin}
            </b>
            <button
              type="button"
              aria-label="More parts"
              onClick={() => edit({ partialMin: Math.min(parts.length, partialMin + 1) })}
              className="grid size-[26px] cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent font-bold max-md:size-11"
            >
              +
            </button>
          </span>
          <span className="text-ink2">of {parts.length} parts</span>
        </div>
        <span role="status" className={cn("text-[13px] font-semibold", rule.ok ? "text-mint-i" : "text-cor-i")}>
          {rule.ok ? "✓" : "✕"} {rule.message}
        </span>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-bg p-3.5">
        <input
          type="checkbox"
          role="switch"
          checked={draft.loopCheck}
          onChange={(e) => edit({ loopCheck: e.target.checked })}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            "relative mt-px h-6 w-10 flex-none rounded-xl shadow-[inset_0_0_0_1.5px_var(--bd)] peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-vio",
            draft.loopCheck ? "bg-mint" : "bg-sf2",
          )}
        >
          <i
            className={cn(
              "absolute top-[3px] size-[18px] rounded-full transition-all",
              draft.loopCheck ? "left-[19px] bg-on-mint" : "left-[3px] bg-bd",
            )}
          />
        </span>
        <span className="text-sm">
          <b className="font-bold">Infinite-loop check</b>
          <br />
          <span className="text-[13px] text-ink3">
            Watch up to 1,000 loop rounds instead of waiting for the program to end. Only for
            endless-loop exercises.
          </span>
        </span>
      </label>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-bg p-3.5">
        <label htmlFor="assignment-check-input" className="text-sm font-bold">
          Check input <span className="font-normal text-ink3">(optional)</span>
        </label>
        <textarea
          id="assignment-check-input"
          value={draft.checkInput}
          maxLength={MAX_CHECK_INPUT_LENGTH}
          rows={2}
          onChange={(e) => edit({ checkInput: e.target.value })}
          className="block w-full resize-y rounded-lg border-[1.5px] border-bd bg-sf px-[9px] py-[5px] font-mono text-[13px] text-ink outline-none focus-visible:border-vio"
          aria-describedby="check-input-hint"
        />
        <span id="check-input-hint" className="text-[12.5px] text-ink3">
          One line per input() call during a check; after that, input() gets empty lines.
        </span>
      </div>
    </section>
  );
}
