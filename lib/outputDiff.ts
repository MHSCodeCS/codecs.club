/**
 * Word-level comparison of expected and actual printed output for Review.
 * Checks ignore spaces and line breaks, so outputs are compared as words; the
 * words one side lacks (longest common subsequence) are marked. A "…" in the
 * expected output is the task author shortening it, so it is never marked.
 */
export type OutputWord = { text: string; matched: boolean };

const ELISION = new Set(["…", "..."]);

/** Larger comparisons are shown without marks rather than slowing the page. */
const MAX_CELLS = 4_000_000;

export function outputWords(output: string): string[] {
  return output.split(/\s+/).filter((w) => w.length > 0);
}

export function diffOutputs(
  expected: string,
  actual: string,
): { expected: OutputWord[]; actual: OutputWord[]; compared: boolean } {
  const a = outputWords(expected);
  const b = outputWords(actual);
  const cols = b.length + 1;
  if ((a.length + 1) * cols > MAX_CELLS) {
    const plain = (words: string[]) => words.map((text) => ({ text, matched: true }));
    return { expected: plain(a), actual: plain(b), compared: false };
  }
  // lengths[i * cols + j] = LCS length of a[i:] and b[j:].
  const lengths = new Uint16Array((a.length + 1) * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i * cols + j] =
        a[i] === b[j]
          ? lengths[(i + 1) * cols + j + 1]! + 1
          : Math.max(lengths[(i + 1) * cols + j]!, lengths[i * cols + j + 1]!);
    }
  }
  const matchedA = new Array<boolean>(a.length).fill(false);
  const matchedB = new Array<boolean>(b.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matchedA[i++] = true;
      matchedB[j++] = true;
    } else if (lengths[(i + 1) * cols + j]! >= lengths[i * cols + j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return {
    expected: a.map((text, k) => ({ text, matched: matchedA[k]! || ELISION.has(text) })),
    actual: b.map((text, k) => ({ text, matched: matchedB[k]! })),
    compared: true,
  };
}
