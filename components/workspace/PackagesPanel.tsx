"use client";

import { useMutation } from "convex/react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_PACKAGES, packageKey, packageSpecProblem } from "@/convex/lib/packages";
import { errorMessage } from "@/lib/errors";
import type { PythonRuntime, RuntimeStatus } from "@/lib/python/runtime";

/**
 * Packages button and popover. Installs with micropip into the running Python
 * and records the package on the workspace so later runs reinstall it.
 */
export function PackagesButton({
  workspaceId,
  packages,
  runtime,
  status,
}: {
  workspaceId: Id<"workspaces">;
  packages: string[];
  runtime: PythonRuntime;
  status: RuntimeStatus;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={root} className="relative">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        Packages{packages.length > 0 ? ` · ${packages.length}` : ""}
      </Button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Packages"
          className="absolute top-[38px] right-0 z-20 flex w-[340px] flex-col gap-3 rounded-2xl bg-sf p-4 text-ink shadow-card"
        >
          <PackagesForm workspaceId={workspaceId} packages={packages} runtime={runtime} status={status} />
        </div>
      )}
    </span>
  );
}

function PackagesForm({
  workspaceId,
  packages,
  runtime,
  status,
}: {
  workspaceId: Id<"workspaces">;
  packages: string[];
  runtime: PythonRuntime;
  status: RuntimeStatus;
}) {
  const setPackages = useMutation(api.workspaces.setPackages);
  const [spec, setSpec] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const inputId = useId();
  const ready = status.kind === "ready";

  const install = async (event: FormEvent) => {
    event.preventDefault();
    const name = spec.trim();
    const problem =
      packageSpecProblem(name) ??
      (packages.some((p) => packageKey(p) === packageKey(name)) ? `${name} is already in this workspace.` : null) ??
      (packages.length >= MAX_PACKAGES ? `A workspace can use at most ${MAX_PACKAGES} packages.` : null);
    if (problem !== null) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await runtime.install(name);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      setBusy(false);
      return;
    }
    try {
      await setPackages({ workspaceId, packages: [...packages, name] });
      setMessage({ tone: "ok", text: `${result.message} It will load each time you run this assignment.` });
      setSpec("");
    } catch (error) {
      setMessage({
        tone: "error",
        text: `${name} is installed for now, but couldn’t be saved to this workspace. ${errorMessage(error, "")}`.trim(),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    setMessage(null);
    try {
      await setPackages({ workspaceId, packages: packages.filter((p) => p !== name) });
      setMessage({ tone: "ok", text: `Removed ${name}. It stays loaded until Python restarts.` });
    } catch (error) {
      setMessage({ tone: "error", text: errorMessage(error, "Couldn’t remove that package. Try again.") });
    }
  };

  return (
    <>
      <div>
        <b className="text-[15px] font-bold">Packages</b>
        <p className="m-0 mt-0.5 text-[13px] text-ink2">
          Most lessons only need what’s built into Python. Add a package when a lesson asks for one.
        </p>
      </div>
      {packages.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {packages.map((p) => (
            <li key={p} className="flex items-center justify-between rounded-[10px] bg-bg py-1 pr-1 pl-3 font-mono text-sm">
              {p}
              <Button variant="ghost" size="sm" onClick={() => void remove(p)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[13px] text-ink3">No extra packages yet.</span>
      )}
      <form onSubmit={(e) => void install(e)} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Package name
        </label>
        <input
          id={inputId}
          value={spec}
          onChange={(e) => {
            setSpec(e.target.value);
            setMessage(null);
          }}
          placeholder="emoji"
          autoCapitalize="none"
          spellCheck={false}
          className="h-9 min-w-0 flex-1 rounded-[10px] border-[1.5px] border-bd bg-bg px-3 font-mono text-sm text-ink"
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={!ready || busy || spec.trim().length === 0}
          loading={busy}
          loadingLabel="Installing…"
          title={ready ? undefined : "Wait for Python to be ready."}
        >
          Install
        </Button>
      </form>
      {message && (
        <span role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-[13px] text-cor-i" : "text-[13px] text-mint-i"}>
          {message.text}
        </span>
      )}
    </>
  );
}
