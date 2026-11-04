"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import { useConfirmLeave } from "./UnsavedWork";

export type Group = string;
type Class = typeof api.classes.list._returnType[number];

const STORAGE_KEY = "codecs-admin-group";

const GroupContext = createContext<{ group: Group; setGroup: (group: Group) => void; classes: Class[]; selectedClass: Class | undefined } | null>(
  null,
);

function readSavedGroup(): Group {
  try {
    return localStorage.getItem(STORAGE_KEY) || "basic";
  } catch {
    return "basic";
  }
}

/** Selected class shared by every admin screen. */
export function GroupProvider({ children }: { children: ReactNode }) {
  // Admin screens render only on the client (after the role check), so
  // reading storage during the first render cannot cause a hydration mismatch.
  const [group, setGroupState] = useState<Group>(readSavedGroup);
  const confirmLeave = useConfirmLeave();
  const setGroup = (next: Group) => {
    if (next === group || !confirmLeave()) return;
    setGroupState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be blocked; the choice still applies for this visit.
    }
  };
  const classes = useQuery(api.classes.list) ?? [];
  const initialize = useMutation(api.classes.initialize);
  useEffect(() => { void initialize().catch(() => {}); }, [initialize]);
  const selectedClass = classes.find(c => c.group === group);
  return <GroupContext value={{ group, setGroup, classes, selectedClass }}>{children}</GroupContext>;
}

export function useGroup() {
  const value = useContext(GroupContext);
  if (value === null) throw new Error("useGroup outside GroupProvider.");
  return value;
}
