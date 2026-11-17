"use client";

import { useConvex, useConvexConnectionState } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { WorkspaceSync, type ServerFile } from "@/lib/workspaceSync";

const LEAVE_PROMPT = "Your latest changes haven’t saved yet. Leave anyway?";

/** Errors a retry cannot fix (bad name, too big); they wait for the next edit. */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof ConvexError)) return true;
  const data = error.data as { code?: string } | null;
  return !["INVALID", "CONFLICT", "NOT_FOUND", "FORBIDDEN"].includes(data?.code ?? "");
}

/**
 * Binds a WorkspaceSync to the saveFiles mutation for one workspace, and
 * saves on tab hide and when the screen goes away. A full page unload with
 * unsaved work asks the browser to warn first.
 */
export function useWorkspaceSync(workspace: {
  _id: Id<"workspaces">;
  files: ServerFile[];
  updatedAt: number;
}) {
  const convex = useConvex();
  const [sync] = useState(
    () =>
      new WorkspaceSync({
        initialFiles: workspace.files,
        savedAt: workspace.updatedAt,
        save: (files) =>
          convex.mutation(api.workspaces.saveFiles, { workspaceId: workspace._id, files }),
        describeError: (error) => ({
          message: errorMessage(error, "Couldn’t reach the server."),
          retry: isRetryable(error),
        }),
      }),
  );
  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);

  useEffect(() => {
    sync.start();
    const saveNow = () => void sync.flush().catch(() => {});
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveNow();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!sync.hasUnsaved()) return;
      saveNow();
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("visibilitychange", onVisibility);
      sync.stop();
    };
  }, [sync]);

  return { sync, snapshot };
}

/** Feeds the Convex connection state into the sync (offline vs. failed). */
export function ConnectionWatcher({ sync }: { sync: WorkspaceSync }) {
  const { isWebSocketConnected } = useConvexConnectionState();
  useEffect(() => {
    sync.setConnected(isWebSocketConnected);
  }, [sync, isWebSocketConnected]);
  return null;
}

/**
 * `onNavigate` for in-app links. A save that is just in progress finishes
 * first; offline or failed work asks before leaving.
 */
export function useLeaveGuard(sync: WorkspaceSync) {
  const router = useRouter();
  return useCallback(
    (href: string) => (event: { preventDefault: () => void }) => {
      if (!sync.hasUnsaved()) return;
      event.preventDefault();
      if (sync.getSnapshot().status.kind === "saving") {
        sync.flush().then(
          () => router.push(href),
          () => {
            if (window.confirm(LEAVE_PROMPT)) router.push(href);
          },
        );
      } else if (window.confirm(LEAVE_PROMPT)) {
        router.push(href);
      }
    },
    [router, sync],
  );
}
