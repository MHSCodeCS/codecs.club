"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type Group = "basic" | "advanced";

const STORAGE_KEY = "codecs-admin-group";

const GroupContext = createContext<{ group: Group; setGroup: (group: Group) => void } | null>(
  null,
);

function readSavedGroup(): Group {
  try {
    return localStorage.getItem(STORAGE_KEY) === "advanced" ? "advanced" : "basic";
  } catch {
    return "basic";
  }
}

/** The basic/advanced selection shared by every admin screen. */
export function GroupProvider({ children }: { children: ReactNode }) {
  // Admin screens render only on the client (after the role check), so
  // reading storage during the first render cannot cause a hydration mismatch.
  const [group, setGroupState] = useState<Group>(readSavedGroup);
  const setGroup = (next: Group) => {
    setGroupState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be blocked; the choice still applies for this visit.
    }
  };
  return <GroupContext value={{ group, setGroup }}>{children}</GroupContext>;
}

export function useGroup() {
  const value = useContext(GroupContext);
  if (value === null) throw new Error("useGroup outside GroupProvider.");
  return value;
}
