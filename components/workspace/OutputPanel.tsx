"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import type { PythonRuntime, RuntimeSnapshot } from "@/lib/python/runtime";

function seconds(ms: number) {
  return ms < 10_000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms / 1000)}s`;
}

/**
 * Program output (stdout, errors in coral, typed input), an input line while
 * the program waits in input(), and a footer saying how the last run ended.
 * Output keeps its original formatting; checks (Phase 5) compare separately.
 */
export function OutputPanel({ runtime, py }: { runtime: PythonRuntime; py: RuntimeSnapshot }) {
  const scroller = useRef<HTMLPreElement>(null);
  const pinned = useRef(true);
  const status = py.status;
  const running = status.kind === "running" || status.kind === "stopping";
  const waiting = status.kind === "running" && status.waitingForInput;

  // Stay at the bottom while new output arrives, unless the student scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [py.output, waiting]);

  const pill =
    status.kind === "running" || status.kind === "stopping" ? (
      <Pill tone="mint" className="px-2.5 font-semibold">Running…</Pill>
    ) : py.lastRun?.outcome === "error" ? (
      <Pill tone="coral" className="px-2.5 font-semibold">Error</Pill>
    ) : py.lastRun?.outcome === "stopped" ? (
      <Pill tone="amber" className="px-2.5 font-semibold">Stopped</Pill>
    ) : py.lastRun?.outcome === "ok" || py.lastRun?.outcome === "limit" ? (
      <Pill className="px-2.5 font-semibold">0 errors</Pill>
    ) : null;

  return (
    <section aria-label="Output" className="flex min-h-0 min-w-0 flex-col border-r border-ln">
      <div className="flex h-[42px] flex-none items-center gap-2.5 px-4">
        <b className="text-sm font-bold">Output</b>
        {pill}
        <button
          type="button"
          onClick={() => runtime.clearOutput()}
          disabled={running || py.output.length === 0}
          className="ml-auto cursor-pointer border-0 bg-transparent text-[13px] font-semibold text-ink3 hover:text-code-ink disabled:cursor-default disabled:opacity-50"
        >
          Clear
        </button>
      </div>
      <pre
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="m-0 min-h-0 flex-1 overflow-auto px-4 font-mono text-sm leading-[1.45] font-medium break-words whitespace-pre-wrap text-code-ink"
      >
        {py.outputTrimmed && (
          <span className="block font-sans text-xs text-ink3 italic">
            Earlier output was trimmed to keep the page fast.
          </span>
        )}
        {py.output.length === 0 && !running && py.lastRun === null ? (
          <span className="font-sans text-sm font-normal text-ink3">
            {status.kind === "unavailable"
              ? status.message
              : "Press Run to see your program’s output here."}
          </span>
        ) : (
          py.output.map((segment, i) => (
            <span
              key={i}
              className={cn(
                segment.kind === "input" && "font-semibold text-mint-i",
                segment.kind === "note" && "font-sans text-xs text-ink3 italic",
                segment.kind === undefined && segment.stream === "stderr" && "text-cor-i",
              )}
            >
              {segment.text}
            </span>
          ))
        )}
        {py.outputDropped && (
          <span className="block font-sans text-xs text-amb-i">
            Output limit reached, so the rest isn’t shown. If your program is still running, press Stop.
          </span>
        )}
      </pre>
      {waiting && <InputLine onSend={(text) => runtime.sendInput(text)} />}
      {py.packageStatus !== null && (
        <div role="status" className="flex-none truncate px-4 pt-1 text-[12.5px] text-amb-i">
          {py.packageStatus}
        </div>
      )}
      <div className="flex-none px-4 pt-2 pb-2.5 text-[12.5px] text-ink3" aria-live="polite">
        <RunSummary py={py} />
      </div>
    </section>
  );
}

function RunSummary({ py }: { py: RuntimeSnapshot }) {
  const status = py.status;
  const [now, setNow] = useState(() => Date.now());
  const running = status.kind === "running";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (status.kind === "running") {
    if (status.waitingForInput) return <>Waiting for you to type a line and press Enter.</>;
    const elapsed = Math.max(0, Math.floor((now - status.startedAt) / 1000));
    return status.mode === "check" ? (
      <>Checking {py.currentEntry} · {elapsed}s</>
    ) : (
      <>
        Running {py.currentEntry} · {elapsed}s · run by you
      </>
    );
  }
  if (status.kind === "stopping") return <>Stopping…</>;
  const last = py.lastRun;
  if (last === null) return <>{py.pythonVersion ? `Python ${py.pythonVersion}` : " "}</>;
  const what = last.mode === "check" ? "Check run" : "Run";
  if (last.outcome === "ok") {
    return last.mode === "check" ? (
      <>Check run finished in {seconds(last.ms)} · {last.entry}</>
    ) : (
      <>Finished in {seconds(last.ms)} · run by you · {last.entry}</>
    );
  }
  if (last.outcome === "limit") {
    return <>Check run stopped your loop after 1,000 rounds, as planned · {last.entry}</>;
  }
  if (last.outcome === "error") {
    return (
      <>
        {what} stopped with an error after {seconds(last.ms)} · {last.entry}
      </>
    );
  }
  if (last.timedOut) return <>Check run stopped after 10s: the program didn’t finish · {last.entry}</>;
  return (
    <>
      {what} stopped after {seconds(last.ms)}
      {last.restarted ? " · Python restarted" : ""} · {last.entry}
    </>
  );
}

function InputLine({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Next keeps a left workspace mounted (hidden), so ids must be unique per screen.
  const inputId = useId();
  // Running the program asked for input, so moving focus here is expected.
  useEffect(() => input.current?.focus(), []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSend(text);
    setText("");
  };
  return (
    <form onSubmit={submit} className="flex flex-none items-center gap-2 px-4 pt-1">
      <label htmlFor={inputId} className="sr-only">
        Input for your program
      </label>
      <span aria-hidden="true" className="font-mono text-sm text-mint-i">
        ›
      </span>
      <input
        ref={input}
        id={inputId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        placeholder="Type here, then press Enter"
        className="h-8 min-w-0 flex-1 rounded-lg border border-ln bg-code-bg px-2.5 font-mono text-sm text-code-ink"
      />
      <Button type="submit" size="sm" variant="secondary" className="h-8">
        Enter
      </Button>
    </form>
  );
}
