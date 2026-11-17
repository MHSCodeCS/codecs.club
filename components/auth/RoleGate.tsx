"use client";

import type { ReactNode } from "react";
import { RequireRole } from "./RequireRole";
import { ViewerProvider } from "./ViewerContext";

/** Renders children only for the given role and provides the viewer. */
export function RoleGate({ role, children }: { role: "student" | "admin"; children: ReactNode }) {
  return (
    <RequireRole role={role}>
      {(viewer) => <ViewerProvider viewer={viewer}>{children}</ViewerProvider>}
    </RequireRole>
  );
}
