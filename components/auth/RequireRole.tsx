"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LoadingState } from "@/components/ui/States";
import { homeFor, useViewer, type Viewer } from "./useViewer";

/**
 * Client-side route guard. It only decides what to render; every Convex
 * function still checks the role itself.
 */
export function RequireRole<R extends Viewer["role"]>({
  role,
  children,
}: {
  role: R;
  children: (viewer: Extract<Viewer, { role: R }>) => ReactNode;
}) {
  const state = useViewer();
  const router = useRouter();
  const { signOut } = useAuthActions();

  useEffect(() => {
    if (state.status === "signedOut") router.replace("/");
    else if (state.status === "unlinked") void signOut().then(() => router.replace("/"));
    else if (state.status === "signedIn" && state.viewer.role !== role) {
      router.replace(homeFor(state.viewer.role));
    }
  }, [state, role, router, signOut]);

  if (state.status === "signedIn" && state.viewer.role === role) {
    return <>{children(state.viewer as Extract<Viewer, { role: R }>)}</>;
  }
  return <LoadingState label="Checking sign-in…" className="justify-center py-24" />;
}

export function useSignOut() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return async () => {
    await signOut();
    router.replace("/");
  };
}
