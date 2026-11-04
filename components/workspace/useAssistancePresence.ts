"use client";
import { useMutation, useConvexConnectionState } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { WorkspaceSync } from "@/lib/workspaceSync";

/** Component-backed online sessions, plus an activity room that expires after idle. */
export function useAssistancePresence(workspaceId?: Id<"workspaces">, sync?: WorkspaceSync, enabled = true) {
  const heartbeat = useMutation(api.presence.heartbeat);
  const disconnect = useMutation(api.presence.disconnect);
  const connection = useConvexConnectionState();
  const [identity, setIdentity] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const selection = useRef<{ file: string; anchor: string; head: string } | null>(null);
  const lastActivity = useRef(0);
  const flushPresence = useRef<(() => void) | null>(null);
  const onCursor = useCallback((file: string, anchor: number, head: number) => {
    const text = sync?.sharedText(file);
    if (!text) return;
    selection.current = { file, anchor: JSON.stringify(Y.createRelativePositionFromTypeIndex(text, anchor)), head: JSON.stringify(Y.createRelativePositionFromTypeIndex(text, head)) };
    flushPresence.current?.();
  }, [sync]);
  useEffect(() => {
    if (!enabled || !connection.isWebSocketConnected) return;
    const sessionId = crypto.randomUUID();
    let tokens: string[] = [], disposed = false, inFlight = false;
    let lastSent = 0, pendingFocus = false;
    lastActivity.current = Date.now();
    const send = async (force = false) => {
      if (disposed) return;
      if (inFlight) { if (force) pendingFocus = true; return; }
      if (!force && Date.now() - lastSent < 400) return;
      inFlight = true; lastSent = Date.now();
      try {
        const focused = !document.hidden && document.hasFocus();
        const result = await heartbeat({ sessionId, workspaceId, focused, active: focused && Date.now() - lastActivity.current < 30_000, ...(selection.current ?? {}) });
        tokens = [...new Set([...tokens, ...result.tokens])];
        if (disposed) await Promise.all(result.tokens.map(sessionToken => disconnect({ sessionToken })));
        else { setIdentity(result.userId); setFailure(null); }
      } catch { if (!disposed) setFailure("Assistance connection lost. Rejoin if your teacher session expired."); }
      finally { inFlight = false; if (pendingFocus && !disposed) { pendingFocus = false; void send(true); } }
    };
    const activity = () => { lastActivity.current = Date.now(); };
    const visibility = () => { if (!document.hidden && document.hasFocus()) activity(); void send(true); };
    flushPresence.current = () => { void send(); };
    void send();
    const timer = setInterval(() => { void send(); }, 10_000);
    window.addEventListener("keydown", activity);
    window.addEventListener("pointerdown", activity);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", visibility);
    window.addEventListener("blur", visibility);
    return () => {
      disposed = true; clearInterval(timer); flushPresence.current = null;
      window.removeEventListener("keydown", activity); window.removeEventListener("pointerdown", activity); document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", visibility); window.removeEventListener("blur", visibility);
      void Promise.all(tokens.map(sessionToken => disconnect({ sessionToken }))).catch(() => {});
    };
  }, [heartbeat, disconnect, workspaceId, enabled, connection.isWebSocketConnected]);
  return { identity, onCursor, connected: connection.isWebSocketConnected, failure };
}

export function peerCursors(cursors: Array<{ userId: string; name: string; role: string; file: string | null; anchor: string | null; head: string | null }>, identity: string | null, file: string, sync: WorkspaceSync) {
  const text = sync.sharedText(file);
  if (!text) return [];
  return cursors.filter(c => c.userId !== identity && c.file === file).flatMap(cursor => {
    try {
      const anchor = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(JSON.parse(cursor.anchor!)), text.doc!);
      const head = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(JSON.parse(cursor.head!)), text.doc!);
      return anchor && head && anchor.type === text && head.type === text ? [{ name: cursor.name, teacher: cursor.role === "teacher", anchor: anchor.index, head: head.index }] : [];
    } catch { return []; }
  });
}
export function StudentPresence() { useAssistancePresence(); return null; }
