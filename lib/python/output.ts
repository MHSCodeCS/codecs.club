import type { OutputChunk, OutputStream } from "./protocol";

/**
 * Worker-side output batching. Python can print far faster than a Chromebook
 * can render, so writes are grouped and sent at most every `intervalMs` (or
 * once `maxBatchChars` accumulate), and one run forwards at most `maxRunChars`.
 * Timers can't fire while Python runs, so flushing is decided on each write.
 */
export class OutputBatcher {
  private chunks: OutputChunk[] = [];
  private pending = 0;
  private sent = 0;
  private lastFlush: number;
  private droppedReported = false;

  constructor(
    private readonly send: (chunks: OutputChunk[]) => void,
    private readonly onDropped: () => void,
    private readonly options: {
      maxRunChars: number;
      intervalMs?: number;
      maxBatchChars?: number;
      now?: () => number;
    },
  ) {
    this.lastFlush = this.now();
  }

  private now() {
    return this.options.now ? this.options.now() : Date.now();
  }

  write(stream: OutputStream, text: string) {
    if (text.length === 0) return;
    const room = this.options.maxRunChars - this.sent - this.pending;
    if (room <= 0) {
      this.reportDropped();
      return;
    }
    const kept = text.length > room ? text.slice(0, room) : text;
    const last = this.chunks[this.chunks.length - 1];
    if (last && last.stream === stream) last.text += kept;
    else this.chunks.push({ stream, text: kept });
    this.pending += kept.length;
    if (kept.length < text.length) this.reportDropped();
    if (
      this.pending >= (this.options.maxBatchChars ?? 16_384) ||
      this.now() - this.lastFlush >= (this.options.intervalMs ?? 50)
    ) {
      this.flush();
    }
  }

  flush() {
    this.lastFlush = this.now();
    if (this.chunks.length === 0) return;
    const chunks = this.chunks;
    this.sent += this.pending;
    this.chunks = [];
    this.pending = 0;
    this.send(chunks);
  }

  private reportDropped() {
    if (this.droppedReported) return;
    this.droppedReported = true;
    this.flush();
    this.onDropped();
  }
}

export type OutputSegment = OutputChunk & { kind?: "input" | "note" };

/**
 * Main-thread output log. Keeps the newest `maxChars` characters so a flood of
 * prints stays cheap to render; records whether older output was trimmed.
 */
export class OutputLog {
  segments: OutputSegment[] = [];
  trimmed = false;
  private total = 0;

  constructor(private readonly maxChars: number) {}

  append(segment: OutputSegment) {
    if (segment.text.length === 0) return;
    const last = this.segments[this.segments.length - 1];
    if (last && last.stream === segment.stream && last.kind === segment.kind) {
      this.segments = [...this.segments.slice(0, -1), { ...last, text: last.text + segment.text }];
    } else {
      this.segments = [...this.segments, segment];
    }
    this.total += segment.text.length;
    this.trim();
  }

  clear() {
    this.segments = [];
    this.total = 0;
    this.trimmed = false;
  }

  get hasError() {
    return this.segments.some((s) => s.stream === "stderr" && s.kind === undefined);
  }

  private trim() {
    if (this.total <= this.maxChars) return;
    let excess = this.total - this.maxChars;
    const segments = [...this.segments];
    while (excess > 0 && segments.length > 0) {
      const first = segments[0]!;
      if (first.text.length <= excess) {
        excess -= first.text.length;
        this.total -= first.text.length;
        segments.shift();
      } else {
        // Cut at a line break when one is close, so the top line stays whole.
        let cut = excess;
        const newline = first.text.indexOf("\n", cut);
        if (newline !== -1 && newline - cut < 200) cut = newline + 1;
        segments[0] = { ...first, text: first.text.slice(cut) };
        this.total -= cut;
        excess = 0;
      }
    }
    this.segments = segments;
    this.trimmed = true;
  }
}
