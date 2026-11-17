/**
 * Rules for files in a student workspace, shared by Convex functions and the
 * editor so the client can refuse a bad name or size before saving. The server
 * re-checks everything; these limits keep a whole-workspace version snapshot
 * well under Convex's 1 MiB document limit.
 */
export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 100_000;
export const MAX_WORKSPACE_BYTES = 400_000;
export const MAX_FILE_NAME_LENGTH = 60;
export const ALLOWED_EXTENSIONS = [".py", ".txt", ".csv", ".json"] as const;

/** `accept` value for the upload picker. */
export const UPLOAD_ACCEPT = ALLOWED_EXTENSIONS.join(",");

const NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/** Returns why a file name is not allowed, or null when it is fine. */
export function fileNameProblem(name: string): string | null {
  if (name.length === 0) return "Give the file a name.";
  if (name.length > MAX_FILE_NAME_LENGTH) {
    return `File names can be at most ${MAX_FILE_NAME_LENGTH} characters.`;
  }
  const lower = name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext) && lower.length > ext.length)) {
    return "Files must end in .py, .txt, .csv or .json.";
  }
  if (!NAME_PATTERN.test(name)) {
    return "Use only letters, numbers, _ - and . in file names (no spaces).";
  }
  return null;
}

export function byteLength(content: string): number {
  return new TextEncoder().encode(content).length;
}

/** Returns why this content is too big for one file, or null. */
export function fileSizeProblem(name: string, content: string): string | null {
  if (byteLength(content) > MAX_FILE_BYTES) {
    return `${name} is larger than ${MAX_FILE_BYTES / 1000} KB.`;
  }
  return null;
}

/** Display and snapshot order: main.py first, then by name. */
export function compareFileNames(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "main.py") return -1;
  if (b === "main.py") return 1;
  return a.localeCompare(b, "en", { sensitivity: "base" }) || (a < b ? -1 : 1);
}

/** Whether two file sets have the same names and contents. */
export function sameFiles(
  a: ReadonlyArray<{ name: string; content: string }>,
  b: ReadonlyArray<{ name: string; content: string }>,
): boolean {
  if (a.length !== b.length) return false;
  const byName = new Map(b.map((f) => [f.name, f.content]));
  return a.every((f) => byName.get(f.name) === f.content);
}
