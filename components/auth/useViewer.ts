"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export type Viewer = NonNullable<typeof api.viewer.current._returnType>;

/**
 * The signed-in viewer. `status` is "loading" until both the auth state and
 * the viewer query have resolved.
 */
export function useViewer():
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "unlinked" }
  | { status: "signedIn"; viewer: Viewer } {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.viewer.current, isAuthenticated ? {} : "skip");
  if (isLoading) return { status: "loading" };
  if (!isAuthenticated) return { status: "signedOut" };
  if (viewer === undefined) return { status: "loading" };
  if (viewer === null) return { status: "unlinked" };
  return { status: "signedIn", viewer };
}

export function homeFor(role: Viewer["role"]): string {
  return role === "admin" ? "/admin/students" : "/learn";
}
