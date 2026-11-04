"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useStudentViewer } from "@/components/auth/ViewerContext";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { AssignmentTypeTag } from "@/components/ui/Pill";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { api } from "@/convex/_generated/api";
import {
  ALLOWED_EXTENSIONS,
  byteLength,
  fileNameProblem,
  fileSizeProblem,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_WORKSPACE_BYTES,
  UPLOAD_ACCEPT,
} from "@/convex/lib/workFiles";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { renderInlineMarkdown } from "@/lib/inlineMarkdown";
import { ENTRY_FILE } from "@/lib/python/config";
import { chooseEntry } from "@/lib/python/runner";
import type { WorkspaceSync } from "@/lib/workspaceSync";
import { CheckPanel } from "./CheckPanel";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { OutputPanel } from "./OutputPanel";
import { PackagesButton } from "./PackagesPanel";
import { RunControls } from "./RunControls";
import { SaveStatusPill } from "./SaveStatusPill";
import { TurnInCard } from "./TurnInCard";
import { usePythonRuntime } from "./usePythonRuntime";
import { ConnectionWatcher, useLeaveGuard, useWorkspaceSync } from "./useWorkspaceSync";
import { VersionsPanel, VersionView } from "./VersionsPanel";

type PanelTab = "task" | "files" | "versions";
type WorkspaceData = NonNullable<FunctionReturnType<typeof api.workspaces.get>>;
type LoadedWorkspace = WorkspaceData & { workspace: NonNullable<WorkspaceData["workspace"]> };
type Message = { tone: "info" | "error"; text: string };

const LATER = "Not available yet.";

/**
 * 4d. Assignment workspace: the task beside a Python editor whose files save
 * to Convex as the student types, and Run executes them in Python in the
 * browser. Guided work can be checked against the task, and Turn in sends a
 * saved snapshot for review. Opening an assignment the first time copies its
 * published starter files. Help comes later.
 */
export function Workspace({ assignmentId }: { assignmentId: string }) {
  const data = useQuery(api.workspaces.get, { assignmentId });
  const open = useMutation(api.workspaces.open);
  const [openError, setOpenError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const needsOpen = data !== undefined && data !== null && data.workspace === null;

  useEffect(() => {
    if (!needsOpen) return;
    let cancelled = false;
    open({ assignmentId }).catch((error: unknown) => {
      if (!cancelled) setOpenError(errorMessage(error, "Couldn’t open your files. Try again."));
    });
    return () => {
      cancelled = true;
    };
  }, [needsOpen, assignmentId, open, attempt]);

  if (data === undefined) return <LoadingState label="Opening your workspace…" />;
  if (data === null) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <EmptyState title="This assignment isn’t available">
          It may not be published yet, its lesson day may not have started, or it belongs to
          another curriculum.{" "}
          <Link href="/learn">Back to your learning home</Link>
        </EmptyState>
      </main>
    );
  }
  if (openError !== null) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <ErrorState
          title="Your files didn’t open."
          onRetry={() => {
            setOpenError(null);
            setAttempt((n) => n + 1);
          }}
        >
          {openError}
        </ErrorState>
      </main>
    );
  }
  if (data.workspace === null) return <LoadingState label="Setting up your files…" />;
  return <WorkspaceScreen key={data.workspace._id} data={data as LoadedWorkspace} />;
}

function WorkspaceScreen({ data }: { data: LoadedWorkspace }) {
  const viewer = useStudentViewer();
  const { assignment, day, workspace, timeZone } = data;
  const { sync, snapshot } = useWorkspaceSync(workspace);
  const { runtime, py } = usePythonRuntime(workspace._id);
  const guardLeave = useLeaveGuard(sync);
  const restoreVersion = useMutation(api.workspaces.restore);
  const prepareCheck = useMutation(api.checks.prepare);
  const recordCheck = useMutation(api.checks.record);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const editor = useRef<CodeEditorHandle>(null);
  // Next keeps a left workspace mounted (hidden), so element ids must be per screen.
  const tabsId = `ws${useId()}`;

  const [tab, setTab] = useState<PanelTab>("task");
  const [activeFile, setActiveFile] = useState(snapshot.files[0]?.name ?? "main.py");
  const [inspecting, setInspecting] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // Merge server changes (a restore, another tab) into the editor.
  useEffect(() => {
    editor.current?.applyRemote(sync.applyServer(workspace.files, workspace.updatedAt));
  }, [sync, workspace.files, workspace.updatedAt]);

  const fileNames = snapshot.files.map((f) => f.name);
  const shownFile = fileNames.includes(activeFile) ? activeFile : (fileNames[0] ?? "main.py");
  const offline = snapshot.status.kind === "offline";
  const firstName = viewer.name.split(" ")[0] ?? viewer.name;
  const dayHref = day.inCurrentCurriculum ? `/learn/days/${day._id}` : "/learn/work";
  const runTarget = chooseEntry(fileNames, inspecting === null ? shownFile : null, ENTRY_FILE);

  /** Runs the files as they are in the editor now (saved or not). */
  const runProgram = () => {
    if (runTarget === null) {
      setMessage({ tone: "error", text: "Add a .py file to run." });
      return;
    }
    const files = fileNames.map((name) => ({ name, content: sync.content(name) ?? "" }));
    runtime.run(files, runTarget, workspace.packages);
  };

  /**
   * Saves, pins the saved files as a version, runs them in check mode, and
   * has Convex evaluate the output, so the result names the code it checked.
   */
  const runCheck = async () => {
    setCheckError(null);
    setChecking(true);
    try {
      try {
        await sync.flush();
      } catch {
        setCheckError("Your latest changes haven’t saved, so the check didn’t run.");
        return;
      }
      const prep = await prepareCheck({ workspaceId: workspace._id });
      const entry = chooseEntry(prep.files.map((f) => f.name), null, ENTRY_FILE);
      if (entry === null) {
        setCheckError("Add a .py file to check.");
        return;
      }
      const run = await runtime.check(prep.files, entry, workspace.packages, {
        observeLoops: prep.observeLoops,
        inputs: prep.inputs,
      });
      if (run.outcome === "stopped" || run.outcome === "unavailable") {
        setCheckError(
          run.outcome === "stopped"
            ? "The check was stopped, so nothing was recorded."
            : "Python isn’t ready, so the check didn’t run.",
        );
        return;
      }
      await recordCheck({
        workspaceId: workspace._id,
        versionId: prep.versionId,
        revisionId: prep.revisionId,
        output: run.output,
        outputTruncated: run.truncated,
        runOutcome: run.outcome,
      });
    } catch (error) {
      setCheckError(errorMessage(error, "The check didn’t finish. Try again."));
    } finally {
      setChecking(false);
    }
  };

  const showFile = (name: string) => {
    setInspecting(null);
    setActiveFile(name);
  };

  const restore = async (number: number) => {
    const ok = window.confirm(
      `Restore v${number}? Your current files are kept in Versions, so you can switch back.`,
    );
    if (!ok) return;
    setRestoring(true);
    setMessage(null);
    try {
      try {
        await sync.flush();
      } catch {
        setMessage({ tone: "error", text: "Your latest changes haven’t saved, so nothing was restored." });
        return;
      }
      const result = await restoreVersion({ workspaceId: workspace._id, number });
      setInspecting(null);
      setMessage({ tone: "info", text: `Restored v${number}. It’s now v${result.number}.` });
    } catch (error) {
      setMessage({ tone: "error", text: errorMessage(error, "Couldn’t restore that version. Try again.") });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="flex h-dvh min-h-[600px] flex-col bg-bg">
      <ConnectionWatcher sync={sync} />
      <header className="flex h-[62px] flex-none items-center gap-3 px-5">
        <Link
          href="/learn"
          onNavigate={guardLeave("/learn")}
          className="text-xl leading-none font-extrabold tracking-[-.03em] text-ink no-underline"
        >
          CodeCS
        </Link>
        <span aria-hidden="true" className="mx-1 h-[22px] w-px bg-ln" />
        <Link
          href={dayHref}
          onNavigate={guardLeave(dayHref)}
          className="text-[15px] font-semibold whitespace-nowrap text-ink2 no-underline"
        >
          Day {day.order}: {day.topic}
        </Link>
        <span aria-hidden="true" className="text-bd">
          /
        </span>
        <h1 className="m-0 truncate text-[21px] leading-none font-extrabold tracking-[-.025em]">
          {assignment.title}
        </h1>
        <span className="flex items-center">
          <AssignmentTypeTag type={assignment.type} />
        </span>

        <div className="ml-auto flex items-center gap-2">
          <SaveStatusPill
            status={snapshot.status}
            timeZone={timeZone}
            onRetry={() => void sync.flush().catch(() => {})}
          />
          <Button variant="secondary" size="md" disabled title={LATER}>
            Ask for help
          </Button>
          {day.slidesUrl && (
            <ButtonLink href={day.slidesUrl} external variant="ghost" size="md">
              Slides ↗
            </ButtonLink>
          )}
          <span className="ml-1 flex items-center gap-2">
            <Avatar name={viewer.name} size={30} className="text-[11px]" />
            <b className="text-sm font-bold">{firstName}</b>
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[372px_minmax(0,1fr)] gap-3 px-3 pb-3">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-[20px] bg-sf">
          <Tabs
            label="Assignment panels"
            idPrefix={tabsId}
            value={tab}
            onChange={setTab}
            className="flex-none px-2.5 pt-2.5"
            items={[
              { value: "task", label: "Task" },
              {
                value: "files",
                label: (
                  <>
                    Files{" "}
                    <span className="font-mono text-xs font-medium text-ink3">{fileNames.length}</span>
                  </>
                ),
              },
              { value: "versions", label: "Versions" },
            ]}
          />
          <TabPanel
            idPrefix={tabsId}
            value={tab}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-[18px]"
          >
            {tab === "task" && <TaskPanel assignment={assignment} />}
            {tab === "files" && (
              <FilesPanel sync={sync} files={snapshot.files} shown={inspecting === null ? shownFile : null} onShow={showFile} />
            )}
            {tab === "versions" && (
              <VersionsPanel
                workspaceId={workspace._id}
                timeZone={timeZone}
                inspecting={inspecting}
                onInspect={setInspecting}
                onRestore={(n) => void restore(n)}
                restoreDisabled={restoring || offline}
              />
            )}
          </TabPanel>

          <TurnInCard
            workspaceId={workspace._id}
            timeZone={timeZone}
            sync={sync}
            unsavedChanges={snapshot.files.some((f) => f.dirty)}
          />
        </aside>

        <section
          aria-label="Python editor"
          className="scheme-dark flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] bg-code-bg text-code-ink"
        >
          <EditorBar
            sync={sync}
            editor={editor}
            files={snapshot.files}
            shownFile={inspecting === null ? shownFile : null}
            onShow={showFile}
            onMessage={setMessage}
            packagesButton={
              <PackagesButton
                workspaceId={workspace._id}
                packages={workspace.packages}
                runtime={runtime}
                status={py.status}
              />
            }
            runControls={
              <RunControls
                status={py.status}
                entry={py.currentEntry}
                runTarget={runTarget}
                onRun={runProgram}
                onStop={() => runtime.stop()}
                onRetry={() => runtime.restart()}
              />
            }
          />

          <Notices
            message={message}
            notice={snapshot.notice}
            failure={snapshot.status.kind === "failed" ? snapshot.status.message : null}
            onDismissMessage={() => setMessage(null)}
            onDismissNotice={() => sync.dismissNotice()}
            onRetry={() => void sync.flush().catch(() => {})}
          />

          {inspecting !== null && (
            <VersionView
              key={inspecting}
              workspaceId={workspace._id}
              number={inspecting}
              timeZone={timeZone}
              onClose={() => setInspecting(null)}
              onRestore={(n) => void restore(n)}
              restoreDisabled={restoring || offline}
            />
          )}
          <div className={cn("min-h-0 flex-1", inspecting !== null && "hidden")}>
            <CodeEditor
              ref={editor}
              fileName={shownFile}
              readContent={(name) => sync.content(name)}
              onChange={(name, content) => sync.edit(name, content)}
              readOnly={restoring}
            />
          </div>

          <div className="grid h-[232px] flex-none grid-cols-2 bg-code-bar">
            <OutputPanel runtime={runtime} py={py} />
            <CheckPanel
              workspaceId={workspace._id}
              guided={assignment.type === "guided"}
              timeZone={timeZone}
              checking={checking}
              canCheck={py.status.kind === "ready"}
              unsavedChanges={snapshot.files.some((f) => f.dirty)}
              onCheck={() => void runCheck()}
              error={checkError}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function TaskPanel({ assignment }: { assignment: LoadedWorkspace["assignment"] }) {
  return (
    <>
      <p className="m-0 text-base leading-[1.55] text-pretty whitespace-pre-line">
        {renderInlineMarkdown(assignment.instructions)}
      </p>
      {assignment.expectedOutput !== null && (
        <div className="flex flex-col gap-1.5">
          <b className="text-[13px] font-bold">Expected output</b>
          <pre className="m-0 overflow-auto rounded-[14px] bg-bg px-3.5 py-3 font-mono text-sm leading-normal font-medium">
            {assignment.expectedOutput}
          </pre>
          {assignment.type === "guided" && (
            <span className="text-[12.5px] text-ink3">
              Spaces and line breaks don’t affect the check.
            </span>
          )}
        </div>
      )}
    </>
  );
}

function FilesPanel({
  sync,
  files,
  shown,
  onShow,
}: {
  sync: WorkspaceSync;
  files: Array<{ name: string; dirty: boolean }>;
  shown: string | null;
  onShow: (name: string) => void;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {files.map((f) => {
        const lines = (sync.content(f.name) ?? "").replace(/\n$/, "").split("\n").length;
        return (
          <li key={f.name}>
            <button
              type="button"
              onClick={() => onShow(f.name)}
              aria-current={f.name === shown ? "true" : undefined}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border-0 px-3 py-2 text-left font-mono text-sm",
                f.name === shown ? "bg-bg font-semibold" : "bg-transparent hover:bg-sf2",
              )}
            >
              <span className="truncate">{f.name}</span>
              <span className="flex-none font-sans text-xs text-ink3">
                {f.dirty ? "Not saved yet" : `${lines} ${lines === 1 ? "line" : "lines"}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** File tabs, new file, upload and download, packages, and the Run/Stop controls. */
function EditorBar({
  sync,
  editor,
  files,
  shownFile,
  onShow,
  onMessage,
  packagesButton,
  runControls,
}: {
  sync: WorkspaceSync;
  editor: RefObject<CodeEditorHandle | null>;
  files: Array<{ name: string; dirty: boolean }>;
  shownFile: string | null;
  onShow: (name: string) => void;
  onMessage: (message: Message | null) => void;
  packagesButton: ReactNode;
  runControls: ReactNode;
}) {
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const names = files.map((f) => f.name);

  const clashOrLimit = (name: string): string | null => {
    const clash = names.find((n) => n.toLowerCase() === name.toLowerCase());
    if (clash) return `There is already a file named ${clash}.`;
    if (names.length >= MAX_FILES) return `A workspace can have at most ${MAX_FILES} files.`;
    return null;
  };

  const createFile = (event: FormEvent) => {
    event.preventDefault();
    let name = newName.trim();
    if (name.length > 0 && !name.includes(".")) name += ".py";
    const problem = fileNameProblem(name) ?? clashOrLimit(name);
    if (problem !== null) {
      setNameError(problem);
      return;
    }
    sync.addFile(name, "");
    setNaming(false);
    setNewName("");
    setNameError(null);
    onShow(name);
    requestAnimationFrame(() => editor.current?.focus());
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = "";
    onMessage(null);
    let last: string | null = null;
    for (const file of picked) {
      const replacing = names.includes(file.name);
      if (!ALLOWED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
        onMessage({
          tone: "error",
          text: `${file.name} can’t be added. Upload .py, .txt, .csv or .json files.`,
        });
        continue;
      }
      const nameProblem = fileNameProblem(file.name);
      if (nameProblem !== null) {
        onMessage({ tone: "error", text: `${nameProblem} Rename ${file.name} and upload it again.` });
        continue;
      }
      const problem =
        (file.size > MAX_FILE_BYTES
          ? `${file.name} is larger than ${MAX_FILE_BYTES / 1000} KB.`
          : null) ?? (replacing ? null : clashOrLimit(file.name));
      if (problem !== null) {
        onMessage({ tone: "error", text: problem });
        continue;
      }
      const content = await file.text();
      const sizeProblem = fileSizeProblem(file.name, content);
      const total =
        names
          .filter((n) => n !== file.name)
          .reduce((sum, n) => sum + byteLength(sync.content(n) ?? ""), 0) + byteLength(content);
      if (sizeProblem !== null || total > MAX_WORKSPACE_BYTES) {
        onMessage({
          tone: "error",
          text:
            sizeProblem ??
            `Uploading ${file.name} would make your files bigger than ${MAX_WORKSPACE_BYTES / 1000} KB together.`,
        });
        continue;
      }
      if (replacing) {
        if (!window.confirm(`Replace ${file.name} with the uploaded file?`)) continue;
        editor.current?.replace(file.name, content);
      } else {
        sync.addFile(file.name, content);
        names.push(file.name);
      }
      last = file.name;
    }
    if (last !== null) onShow(last);
  };

  const download = () => {
    const name = shownFile ?? names[0];
    if (name === undefined) return;
    const type = name.endsWith(".json")
      ? "application/json"
      : name.endsWith(".csv")
        ? "text/csv"
        : "text/plain";
    const url = URL.createObjectURL(
      new Blob([sync.content(name) ?? ""], { type: `${type};charset=utf-8` }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="flex h-[52px] flex-none items-center gap-1.5 bg-code-bar pr-2.5 pl-3">
      <div role="group" aria-label="Files" className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
        {files.map((f) => (
          <button
            key={f.name}
            type="button"
            onClick={() => onShow(f.name)}
            aria-pressed={f.name === shownFile}
            title={f.dirty ? `${f.name} (not saved yet)` : f.name}
            className={cn(
              "flex h-[34px] flex-none cursor-pointer items-center gap-1.5 rounded-[9px] border-0 px-3.5 font-mono text-[13px]",
              f.name === shownFile
                ? "bg-code-bg font-semibold text-code-ink"
                : "bg-transparent font-medium text-ink3 hover:text-code-ink",
            )}
          >
            {f.name}
            {f.dirty && (
              <span aria-hidden="true" className="size-1.5 rounded-full bg-amb" />
            )}
          </button>
        ))}
      </div>
      {naming ? (
        <form onSubmit={createFile} className="relative flex flex-none items-center gap-1">
          <input
            autoFocus
            aria-label="New file name"
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? errorId : undefined}
            value={newName}
            placeholder="helpers.py"
            onChange={(e) => {
              setNewName(e.target.value);
              setNameError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setNaming(false);
                setNewName("");
                setNameError(null);
              }
            }}
            className="h-[30px] w-36 rounded-lg border border-ln bg-code-bg px-2 font-mono text-[13px] text-code-ink"
          />
          <Button type="submit" size="sm" variant="secondary" className="h-[30px]">
            Add
          </Button>
          {nameError && (
            <span
              id={errorId}
              role="alert"
              className="absolute top-[36px] left-0 z-10 w-64 rounded-lg bg-cor-s px-2.5 py-1.5 text-xs font-semibold text-cor-i shadow-card"
            >
              {nameError}
            </span>
          )}
        </form>
      ) : (
        <button
          type="button"
          aria-label="New file"
          title="New file"
          onClick={() => setNaming(true)}
          className="size-[34px] flex-none cursor-pointer rounded-[9px] border-0 bg-transparent text-lg text-ink3 hover:bg-sf2"
        >
          +
        </button>
      )}
      <span className="ml-auto flex flex-none gap-0.5">
        <input
          ref={uploadRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          multiple
          hidden
          onChange={(e) => void upload(e)}
        />
        <Button variant="ghost" size="sm" onClick={() => uploadRef.current?.click()} title="Upload .py, .txt, .csv or .json files">
          Upload
        </Button>
        <Button variant="ghost" size="sm" onClick={download} title={`Download ${shownFile ?? "this file"}`}>
          Download
        </Button>
        {packagesButton}
      </span>
      <span aria-hidden="true" className="mx-1.5 h-[22px] w-px flex-none bg-ln" />
      {runControls}
    </div>
  );
}

function Notices({
  message,
  notice,
  failure,
  onDismissMessage,
  onDismissNotice,
  onRetry,
}: {
  message: Message | null;
  notice: string | null;
  failure: string | null;
  onDismissMessage: () => void;
  onDismissNotice: () => void;
  onRetry: () => void;
}) {
  if (message === null && notice === null && failure === null) return null;
  const row = "flex flex-none items-center gap-3 px-4 py-2 text-[13px]";
  const close = "ml-auto cursor-pointer border-0 bg-transparent text-[13px] font-semibold";
  return (
    <div className="flex flex-none flex-col">
      {failure !== null && (
        <div role="alert" className={cn(row, "bg-cor-s text-cor-i")}>
          <span>
            <b className="font-bold">Save failed.</b> {failure} Your changes are still here.
          </span>
          <button type="button" onClick={onRetry} className={close}>
            Retry
          </button>
        </div>
      )}
      {notice !== null && (
        <div role="status" className={cn(row, "bg-amb-s text-amb-i")}>
          <span>{notice}</span>
          <button type="button" onClick={onDismissNotice} className={close}>
            Dismiss
          </button>
        </div>
      )}
      {message !== null && (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(row, message.tone === "error" ? "bg-cor-s text-cor-i" : "bg-mint-s text-mint-i")}
        >
          <span>{message.text}</span>
          <button type="button" onClick={onDismissMessage} className={close}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
