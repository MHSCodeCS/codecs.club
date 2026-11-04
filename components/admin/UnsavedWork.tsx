"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const Context = createContext<{ drafts: Map<symbol, string>; confirmLeave: () => boolean } | null>(null);
export function UnsavedWorkProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<symbol, string>());
  const confirmLeave = () => drafts.size === 0 || window.confirm(`Discard unsaved ${[...drafts.values()].join(" and ")} changes?`);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (drafts.size) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts]);
  return <Context value={{ drafts: drafts, confirmLeave }}>{children}</Context>;
}
export function useConfirmLeave() { return useContext(Context)?.confirmLeave ?? (() => true); }
export function useUnsavedWork(dirty: boolean, label: string) {
  const context = useContext(Context);
  const drafts = context?.drafts;
  useEffect(() => {
    if (!dirty || !drafts) return;
    const key = Symbol();
    drafts.set(key, label);
    return () => { drafts.delete(key); };
  }, [drafts, dirty, label]);
}
