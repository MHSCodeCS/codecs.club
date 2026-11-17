import { compareFileNames } from "../convex/lib/workFiles";

/**
 * Autosave engine for the Assignment Workspace, kept free of React and
 * CodeMirror so its rules are unit-tested (workspaceSync.test.ts):
 *
 * - Local edits are debounced into one save at a time; nothing reads as saved
 *   until the save mutation resolves.
 * - Failed saves keep the edits and retry with backoff, and right away on
 *   reconnect. While disconnected, pending edits show as offline (the Convex
 *   client holds queued mutations until it reconnects).
 * - Server updates are merged per file: our own write echoes are ignored,
 *   untouched files adopt the server text, and a file changed both here and
 *   elsewhere keeps the local text. The server snapshots the other copy into
 *   version history when that save lands.
 */

export type ServerFile = { name: string; content: string; revision: number };
export type SaveFile = { name: string; content: string; baseRevision: number };
export type SaveResult = { savedAt: number; files: Array<{ name: string; revision: number }> };
export type SaveErrorInfo = { message: string; retry: boolean };

export type SaveStatus =
  | { kind: "saved"; savedAt: number | null }
  | { kind: "saving" }
  | { kind: "offline" }
  | { kind: "failed"; message: string; retrying: boolean };

export type SyncSnapshot = {
  files: Array<{ name: string; dirty: boolean }>;
  status: SaveStatus;
  notice: string | null;
};

/** Text the editor must show after a server merge; null removes the file. */
export type RemoteChange = { name: string; content: string | null };

type Entry = {
  local: string;
  /** Last server state the local text is based on; content null = not on the server. */
  base: { revision: number; content: string | null };
  /** Text of a save that has not resolved yet. */
  inFlight: string | null;
};

export type WorkspaceSyncOptions = {
  initialFiles: ServerFile[];
  savedAt: number | null;
  save: (files: SaveFile[]) => Promise<SaveResult>;
  describeError: (error: unknown) => SaveErrorInfo;
  debounceMs?: number;
  /** Longest a continuous stream of edits waits before a save starts. */
  maxWaitMs?: number;
  now?: () => number;
};

export const MAX_RETRY_MS = 30_000;

export class WorkspaceSync {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private snapshot!: SyncSnapshot;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirtySince: number | null = null;
  private saving = false;
  private failures = 0;
  private error: SaveErrorInfo | null = null;
  private connected = true;
  private savedAt: number | null;
  private notice: string | null = null;
  private waiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  private stopped = false;
  private snapshotKey = "";
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly now: () => number;

  constructor(private readonly options: WorkspaceSyncOptions) {
    this.debounceMs = options.debounceMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 4_000;
    this.now = options.now ?? Date.now;
    this.savedAt = options.savedAt;
    for (const file of options.initialFiles) {
      this.entries.set(file.name, {
        local: file.content,
        base: { revision: file.revision, content: file.content },
        inFlight: null,
      });
    }
    this.refresh();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SyncSnapshot => this.snapshot;

  content(name: string): string | null {
    return this.entries.get(name)?.local ?? null;
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Whether leaving now could lose work. */
  hasUnsaved(): boolean {
    return this.saving || this.hasDirty();
  }

  /** Records a local edit and schedules a save. */
  edit(name: string, content: string): void {
    const entry = this.entries.get(name);
    if (entry === undefined || entry.local === content) return;
    entry.local = content;
    this.error = null;
    this.schedule();
    this.refresh();
  }

  /** Adds a file that exists only locally until its first save. */
  addFile(name: string, content: string): void {
    if (this.entries.has(name)) {
      this.edit(name, content);
      return;
    }
    this.entries.set(name, { local: content, base: { revision: 0, content: null }, inFlight: null });
    this.error = null;
    this.schedule();
    this.refresh();
  }

  /** Merges the server's working copy; returns what the editor must update. */
  applyServer(files: ServerFile[], savedAt: number): RemoteChange[] {
    const changes: RemoteChange[] = [];
    const seen = new Set<string>();
    for (const server of files) {
      seen.add(server.name);
      const base = { revision: server.revision, content: server.content };
      const entry = this.entries.get(server.name);
      if (entry === undefined) {
        this.entries.set(server.name, { local: server.content, base, inFlight: null });
        changes.push({ name: server.name, content: server.content });
        continue;
      }
      if (entry.base.revision === server.revision && entry.base.content === server.content) continue;
      if (server.content === entry.local || server.content === entry.inFlight) {
        // Already showing this text, or it is our own save coming back.
        entry.base = base;
      } else if (entry.local === entry.base.content && entry.inFlight === null) {
        entry.local = server.content;
        entry.base = base;
        changes.push({ name: server.name, content: server.content });
      } else {
        this.notice = `${server.name} was also changed somewhere else. Your copy is kept; the other one is in Versions.`;
      }
    }
    for (const [name, entry] of this.entries) {
      if (seen.has(name) || entry.base.content === null) continue;
      if (entry.local === entry.base.content && entry.inFlight === null) {
        // Removed on the server (a restore) and untouched here.
        this.entries.delete(name);
        changes.push({ name, content: null });
      }
      // Edited here but gone on the server: kept, and the next save recreates it.
    }
    this.savedAt = Math.max(this.savedAt ?? 0, savedAt);
    if (this.hasDirty() && !this.saving && this.timer === null && this.error === null) {
      this.schedule();
    }
    this.refresh();
    return changes;
  }

  setConnected(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    if (connected && this.error?.retry && !this.saving) {
      this.clearTimer();
      void this.run();
    }
    this.refresh();
  }

  dismissNotice(): void {
    this.notice = null;
    this.refresh();
  }

  /** Saves now; resolves once everything is saved, rejects if a save fails. */
  flush(): Promise<void> {
    if (!this.hasUnsaved()) return Promise.resolve();
    const done = new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }));
    this.clearTimer();
    if (!this.saving) void this.run();
    return done;
  }

  /** Resumes debounced saves and retries (after `stop`, e.g. a remount). */
  start(): void {
    this.stopped = false;
    if (this.hasDirty() && !this.saving && this.timer === null) this.schedule();
  }

  /**
   * Leaving the screen: saves what is pending right away, then stops timers.
   * The Convex client outlives the screen, so that save still lands.
   */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
    if (this.hasDirty() && !this.saving) void this.run();
  }

  private hasDirty(): boolean {
    for (const entry of this.entries.values()) {
      if (entry.local !== entry.base.content) return true;
    }
    return false;
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    if (this.stopped) return;
    const now = this.now();
    this.dirtySince ??= now;
    this.clearTimer();
    const wait = Math.max(0, Math.min(this.debounceMs, this.dirtySince + this.maxWaitMs - now));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, wait);
  }

  private async run(): Promise<void> {
    if (this.saving) return;
    const batch = [...this.entries].filter(([, entry]) => entry.local !== entry.base.content);
    if (batch.length === 0) {
      this.dirtySince = null;
      this.settle(null);
      this.refresh();
      return;
    }
    this.saving = true;
    this.dirtySince = null;
    for (const [, entry] of batch) entry.inFlight = entry.local;
    this.refresh();
    let failure: unknown = null;
    try {
      const result = await this.options.save(
        batch.map(([name, entry]) => ({
          name,
          content: entry.inFlight!,
          baseRevision: entry.base.revision,
        })),
      );
      for (const saved of result.files) {
        const entry = this.entries.get(saved.name);
        if (entry?.inFlight != null) {
          entry.base = { revision: saved.revision, content: entry.inFlight };
        }
      }
      this.savedAt = Math.max(this.savedAt ?? 0, result.savedAt);
      this.failures = 0;
      this.error = null;
    } catch (error) {
      failure = error;
      this.failures += 1;
      this.error = this.options.describeError(error);
    } finally {
      for (const [, entry] of batch) entry.inFlight = null;
      this.saving = false;
    }

    if (failure !== null) {
      this.settle(failure);
      if (this.error?.retry && !this.stopped) {
        const delay = Math.min(MAX_RETRY_MS, 2_000 * 2 ** (this.failures - 1));
        this.clearTimer();
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.run();
        }, delay);
      }
    } else if (this.hasDirty()) {
      // Edits made while saving: save them next, at once when someone is waiting.
      if (this.waiters.length > 0 || this.stopped) void this.run();
      else this.schedule();
    } else {
      this.settle(null);
    }
    this.refresh();
  }

  private settle(failure: unknown) {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) {
      if (failure === null) waiter.resolve();
      else waiter.reject(new Error(this.error?.message ?? "Save failed."));
    }
  }

  private status(): SaveStatus {
    if (!this.hasUnsaved()) return { kind: "saved", savedAt: this.savedAt };
    if (!this.connected) return { kind: "offline" };
    if (this.error !== null) {
      return { kind: "failed", message: this.error.message, retrying: this.error.retry };
    }
    return { kind: "saving" };
  }

  /** Publishes a new snapshot only when something visible changed, not per keystroke. */
  private refresh() {
    const next: SyncSnapshot = {
      files: [...this.entries]
        .map(([name, entry]) => ({ name, dirty: entry.local !== entry.base.content }))
        .sort((a, b) => compareFileNames(a.name, b.name)),
      status: this.status(),
      notice: this.notice,
    };
    const key = JSON.stringify(next);
    if (key === this.snapshotKey) return;
    this.snapshotKey = key;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
