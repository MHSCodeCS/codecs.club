"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Viewer } from "./useViewer";

type StudentViewer = Extract<Viewer, { role: "student" }>;
type AdminViewer = Extract<Viewer, { role: "admin" }>;

const ViewerContext = createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}

export function useStudentViewer(): StudentViewer {
  const viewer = useContext(ViewerContext);
  if (viewer?.role !== "student") throw new Error("useStudentViewer outside a student area.");
  return viewer;
}

export function useAdminViewer(): AdminViewer {
  const viewer = useContext(ViewerContext);
  if (viewer?.role !== "admin") throw new Error("useAdminViewer outside the admin area.");
  return viewer;
}
