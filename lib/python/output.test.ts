import { describe, expect, test } from "vitest";
import { OutputBatcher, OutputLog } from "./output";
import type { OutputChunk } from "./protocol";

describe("OutputBatcher", () => {
  function setup(options: { maxRunChars?: number; intervalMs?: number; maxBatchChars?: number } = {}) {
    let time = 0;
    const sent: OutputChunk[][] = [];
    let dropped = 0;
    const batcher = new OutputBatcher(
      (chunks) => sent.push(chunks),
      () => (dropped += 1),
      { maxRunChars: options.maxRunChars ?? 1000, intervalMs: options.intervalMs ?? 50, maxBatchChars: options.maxBatchChars ?? 100, now: () => time },
    );
    return { batcher, sent, dropped: () => dropped, tick: (ms: number) => (time += ms) };
  }

  test("groups quick writes and sends them once the interval passes", () => {
    const { batcher, sent, tick } = setup();
    batcher.write("stdout", "a\n");
    batcher.write("stdout", "b\n");
    expect(sent).toHaveLength(0);
    tick(60);
    batcher.write("stderr", "oops\n");
    expect(sent).toEqual([[{ stream: "stdout", text: "a\nb\n" }, { stream: "stderr", text: "oops\n" }]]);
  });

  test("sends early when a batch gets large, and flush sends the rest", () => {
    const { batcher, sent } = setup({ maxBatchChars: 10 });
    batcher.write("stdout", "0123456789");
    expect(sent).toHaveLength(1);
    batcher.write("stdout", "x");
    batcher.flush();
    expect(sent.at(-1)).toEqual([{ stream: "stdout", text: "x" }]);
  });

  test("stops forwarding past the per-run limit and reports it once", () => {
    const { batcher, sent, dropped } = setup({ maxRunChars: 5 });
    batcher.write("stdout", "abc");
    batcher.write("stdout", "defgh");
    batcher.write("stdout", "more");
    batcher.flush();
    expect(sent.flat().map((c) => c.text).join("")).toBe("abcde");
    expect(dropped()).toBe(1);
  });
});

describe("OutputLog", () => {
  test("merges neighbouring output from the same stream", () => {
    const log = new OutputLog(100);
    log.append({ stream: "stdout", text: "a" });
    log.append({ stream: "stdout", text: "b" });
    log.append({ stream: "stdout", kind: "input", text: "typed\n" });
    expect(log.segments).toEqual([
      { stream: "stdout", text: "ab" },
      { stream: "stdout", kind: "input", text: "typed\n" },
    ]);
  });

  test("keeps only the newest output and marks it trimmed", () => {
    const log = new OutputLog(10);
    log.append({ stream: "stdout", text: "line one\n" });
    log.append({ stream: "stderr", text: "line two\n" });
    const text = log.segments.map((s) => s.text).join("");
    expect(text.length).toBeLessThanOrEqual(10);
    expect(text.endsWith("line two\n")).toBe(true);
    expect(log.trimmed).toBe(true);
    expect(log.hasError).toBe(true);
    log.clear();
    expect(log.segments).toEqual([]);
    expect(log.trimmed).toBe(false);
  });
});
